from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from openai.resources.containers.files import content
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import openai
import asyncio
import json
import logging
from datetime import datetime

from app.services.chroma_service import get_chroma_service, chroma_service
from app.core.database import get_db
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)

router = APIRouter()

class OpenAIConfig(BaseModel):
    api_key: str = Field(..., description="OpenAI API key")
    model: str = Field(default="gpt-4-turbo", description="OpenAI model to use")
    temperature: float = Field(default=0.3, ge=0.0, le=2.0, description="Temperature for response generation")
    max_tokens: Optional[int] = Field(default=None, description="Maximum tokens in response")
    top_p: float = Field(default=1.0, ge=0.0, le=1.0, description="Top-p sampling parameter")

class OpenAIRAGConfig(BaseModel):
    responseLength: str = Field(default="medium", description="Response length preference")
    contextDepth: str = Field(default="balanced", description="Context depth preference")
    citations: str = Field(default="standard", description="Citation level preference")
    filterDocType: Optional[str] = Field(default="", description="Document type filter")
    filterCategory: Optional[str] = Field(default="", description="Category filter")
    useOpenAI: bool = Field(default=True, description="Use OpenAI instead of local LLM")
    openAI: OpenAIConfig = Field(..., description="OpenAI configuration")

class OpenAIRAGRequest(BaseModel):
    message: str = Field(..., description="User message")
    config: OpenAIRAGConfig = Field(..., description="OpenAI RAG configuration")
    mode: str = Field(default="rag", description="Processing mode")
    stream: bool = Field(default=False, description="Enable streaming response")
    conversation_id: Optional[str] = Field(default=None, description="Conversation ID")

class OpenAIRAGResponse(BaseModel):
    response: str = Field(..., description="Generated response")
    sources: List[Dict[str, Any]] = Field(default=[], description="Source documents")
    model_used: str = Field(..., description="Model used for generation")
    tokens_used: Optional[int] = Field(default=None, description="Tokens consumed")
    processing_time: float = Field(..., description="Processing time in seconds")

def validate_openai_key(api_key: str) -> bool:
    """Validate OpenAI API key format"""
    return api_key.startswith('sk-') and len(api_key) > 20

def get_openai_client(api_key: str) -> openai.OpenAI:
    """Get OpenAI client with API key"""
    if not validate_openai_key(api_key):
        raise HTTPException(status_code=400, detail="Invalid OpenAI API key format")

    try:
        client = openai.OpenAI(api_key=api_key)
        return client
    except Exception as e:
        logger.error(f"Error creating OpenAI client: {str(e)}")
        raise HTTPException(status_code=400, detail="Failed to initialize OpenAI client")


async def get_rag_context(message: str, config: OpenAIRAGConfig) -> Dict[str, Any]:
    """Get RAG context from documents"""
    try:
        # Get ChromaDB service
        chroma_service = get_chroma_service()
        if not chroma_service:
            logger.error("ChromaDB service not available")
            return {'context': '', 'sources': [], 'total_chunks': 0}

        # Determine search limit based on context depth - FIX THIS
        context_depth = getattr(config, 'contextDepth', 'balanced')
        search_limit = {
            'focused': 3,
            'balanced': 5,
            'comprehensive': 10
        }.get(context_depth, 5)

        # Search for relevant documents
        search_results = await chroma_service.search_documents(
            query=message,
            n_results=search_limit,
            similarity_threshold=0.3  # Add this parameter like in search.py
        )
        # Extract context and sources
        context_chunks = []
        sources = []

        for result in search_results:
            # Get the content from the current search result
            chunk_content = result.get('content', '')

            # Add the text content to the context for the LLM
            context_chunks.append(chunk_content)

            # Add the source information, including the content for the UI preview
            sources.append({
                'document_id': result.get('document_id'),
                'title': result.get('title', 'Unknown'),
                'file_path': result.get('file_path', ''),
                'chunk_id': result.get('chunk_id', ''),
                'similarity_score': result.get('similarity_score', 0.0),
                'page_number': result.get('page_number', None),
                'content': chunk_content  # This provides the text for the preview
            })

        context = '\n\n'.join(context_chunks)

        return {
            'context': context,
            'sources': sources,
            'total_chunks': len(context_chunks)
        }
    except Exception as e:
        logger.error(f"Error getting RAG context: {str(e)}")
        return {'context': '', 'sources': [], 'total_chunks': 0}

def build_openai_prompt(message: str, context: str, config: OpenAIRAGConfig) -> str:
    """Build prompt for OpenAI based on configuration"""

    # Response length instructions
    length_instructions = {
        "short": "Provide a concise, brief response (1-2 paragraphs maximum).",
        "medium": "Provide a balanced response with sufficient detail (2-4 paragraphs).",
        "long": "Provide a comprehensive, detailed response with thorough explanations."
    }

    # Citation instructions
    citation_instructions = {
        "minimal": "Include basic source references where relevant.",
        "standard": "Include clear citations with source titles and page numbers where available.",
        "detailed": "Include detailed citations with source titles, page numbers, and brief context for each reference."
    }

    prompt = f"""You are an AI assistant that answers questions based on provided document context. 

INSTRUCTIONS:
- {length_instructions.get(config.responseLength, length_instructions['medium'])}
- {citation_instructions.get(config.citations, citation_instructions['standard'])}
- Base your answer primarily on the provided context
- If the context doesn't contain enough information, clearly state this
- Be accurate and helpful
- Use a professional yet conversational tone

CONTEXT FROM DOCUMENTS:
{context}

USER QUESTION:
{message}

Please provide your response based on the above context and instructions."""

    return prompt

@router.post("/openai/rag", response_model=OpenAIRAGResponse)
async def openai_rag_chat(
    request: OpenAIRAGRequest,
    db = Depends(get_db),

):
    """Handle OpenAI RAG chat request"""
    start_time = datetime.now()

    try:
        # Validate OpenAI configuration
        if not request.config.useOpenAI:
            raise HTTPException(status_code=400, detail="OpenAI is not enabled in configuration")

        # Get OpenAI client
        client = get_openai_client(request.config.openAI.api_key)

        # Get RAG context
        rag_context = await get_rag_context(request.message, request.config)

        # Build prompt
        prompt = build_openai_prompt(
            request.message,
            rag_context['context'],
            request.config
        )

        # Make OpenAI request
        try:
            response = client.chat.completions.create(
                model=request.config.openAI.model,
                messages=[
                    {"role": "system", "content": "You are a helpful AI assistant that answers questions based on provided document context."},
                    {"role": "user", "content": prompt}
                ],
                temperature=request.config.openAI.temperature,
                max_tokens=request.config.openAI.max_tokens,
                top_p=request.config.openAI.top_p
            )

            # Extract response
            ai_response = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else None

        except openai.APIError as e:
            logger.error(f"OpenAI API error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"OpenAI API error: {str(e)}")
        except Exception as e:
            logger.error(f"Error calling OpenAI: {str(e)}")
            raise HTTPException(status_code=500, detail="Error processing OpenAI request")

        # Calculate processing time
        processing_time = (datetime.now() - start_time).total_seconds()

        # Log successful request
        logger.info(f"OpenAI RAG request completed in {processing_time:.2f}s using {request.config.openAI.model}")

        return OpenAIRAGResponse(
            response=ai_response,
            sources=rag_context['sources'],
            model_used=request.config.openAI.model,
            tokens_used=tokens_used,
            processing_time=processing_time
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in OpenAI RAG chat: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/openai/rag/stream")
async def openai_rag_stream(
    request: OpenAIRAGRequest,
    db = Depends(get_db)

):
    """Handle OpenAI RAG streaming chat request"""

    async def generate_stream():
        start_time = datetime.now()

        try:
            # Validate OpenAI configuration
            if not request.config.useOpenAI:
                yield f"data: {json.dumps({'error': 'OpenAI is not enabled in configuration'})}\n\n"
                return

            # Get OpenAI client
            client = get_openai_client(request.config.openAI.api_key)

            # Send initial status
            yield f"data: {json.dumps({'status': 'processing', 'message': 'Retrieving relevant documents...'})}\n\n"

            # Get RAG context
            rag_context = await get_rag_context(request.message, request.config)

            # Send context status
            yield f"data: {json.dumps({'status': 'context_ready', 'sources_count': len(rag_context['sources'])})}\n\n"

            # Build prompt
            prompt = build_openai_prompt(
                request.message,
                rag_context['context'],
                request.config
            )

            # Send generation status
            yield f"data: {json.dumps({'status': 'generating', 'message': f'Generating response with {request.config.openAI.model}...'})}\n\n"

            # Make streaming OpenAI request
            try:
                stream = client.chat.completions.create(
                    model=request.config.openAI.model,
                    messages=[
                        {"role": "system", "content": "You are a helpful AI assistant that answers questions based on provided document context."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=request.config.openAI.temperature,
                    max_tokens=request.config.openAI.max_tokens,
                    top_p=request.config.openAI.top_p,
                    stream=True
                )

                full_response = ""
                for chunk in stream:
                    if chunk.choices[0].delta.content is not None:
                        content = chunk.choices[0].delta.content
                        full_response += content

                        # Send chunk
                        yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

                # Send sources and completion
                processing_time = (datetime.now() - start_time).total_seconds()

                yield f"data: {json.dumps({'type': 'sources', 'sources': rag_context['sources']})}\n\n"
                yield f"data: {json.dumps({'type': 'complete', 'processing_time': processing_time, 'model_used': request.config.openAI.model})}\n\n"

            except openai.APIError as e:
                logger.error(f"OpenAI API error: {str(e)}")
                yield f"data: {json.dumps({'error': f'OpenAI API error: {str(e)}'})}\n\n"
            except Exception as e:
                logger.error(f"Error calling OpenAI: {str(e)}")
                yield f"data: {json.dumps({'error': 'Error processing OpenAI request'})}\n\n"

        except Exception as e:
            logger.error(f"Unexpected error in OpenAI RAG stream: {str(e)}")
            yield f"data: {json.dumps({'error': 'Internal server error'})}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream"
        }
    )

@router.post("/openai/validate")
async def validate_openai_config(config: OpenAIConfig):
    """Validate OpenAI configuration"""

    try:
        # Validate API key format
        if not validate_openai_key(config.api_key):
            raise HTTPException(status_code=400, detail="Invalid OpenAI API key format")

        # Test API key by making a simple request
        client = get_openai_client(config.api_key)

        try:
            # Make a minimal test request
            response = client.chat.completions.create(
                model=config.model,
                messages=[{"role": "user", "content": "Hello"}],
                max_tokens=10
            )

            return {
                "valid": True,
                "model": config.model,
                "message": "OpenAI configuration is valid"
            }

        except openai.APIError as e:
            logger.error(f"OpenAI API validation error: {str(e)}")
            return {
                "valid": False,
                "error": str(e),
                "message": "OpenAI API key validation failed"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating OpenAI config: {str(e)}")
        raise HTTPException(status_code=500, detail="Error validating OpenAI configuration")


@router.get("/openai/models")
async def get_openai_models(api_key: str):
    """Get available OpenAI models"""

    try:
        # Validate API key format
        if not validate_openai_key(api_key):
            raise HTTPException(status_code=400, detail="Invalid OpenAI API key format")

        # Get OpenAI client
        client = get_openai_client(api_key)

        try:
            # Get available models
            models = client.models.list()

            # Filter for chat models
            chat_models = []
            for model in models.data:
                if any(prefix in model.id for prefix in ['gpt-3.5', 'gpt-4']):
                    chat_models.append({
                        'id': model.id,
                        'name': model.id,
                        'owned_by': model.owned_by,
                        'created': model.created
                    })

            # Sort by name
            chat_models.sort(key=lambda x: x['name'])

            return {
                "models": chat_models,
                "total": len(chat_models)
            }

        except openai.APIError as e:
            logger.error(f"OpenAI API error getting models: {str(e)}")
            raise HTTPException(status_code=400, detail=f"OpenAI API error: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting OpenAI models: {str(e)}")
        raise HTTPException(status_code=500, detail="Error retrieving OpenAI models")


@router.get("/openai/usage")
async def get_openai_usage(api_key: str, days: int = 30):
    """Get OpenAI usage statistics"""

    try:
        # Validate API key format
        if not validate_openai_key(api_key):
            raise HTTPException(status_code=400, detail="Invalid OpenAI API key format")

        # Get OpenAI client
        client = get_openai_client(api_key)

        try:
            # Note: OpenAI doesn't provide a direct usage API in the current version
            # This is a placeholder for future implementation
            return {
                "message": "Usage statistics not available in current OpenAI API version",
                "suggestion": "Check usage in OpenAI dashboard at https://platform.openai.com/usage"
            }

        except openai.APIError as e:
            logger.error(f"OpenAI API error getting usage: {str(e)}")
            raise HTTPException(status_code=400, detail=f"OpenAI API error: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting OpenAI usage: {str(e)}")
        raise HTTPException(status_code=500, detail="Error retrieving OpenAI usage")


# Health check endpoint
@router.get("/openai/health")
async def openai_health():
    """Health check for OpenAI service"""
    return {
        "status": "healthy",
        "service": "OpenAI RAG Service",
        "timestamp": datetime.now().isoformat()
    }