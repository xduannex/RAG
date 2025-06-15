import asyncio
import logging

import aiohttp
import httpx
from typing import Dict, Any, List, Optional
import json

logger = logging.getLogger(__name__)


class OllamaService:
    def __init__(self, base_url: str = "http://localhost:11434", timeout: int = 30):
        """Initialize Ollama service with defensive attribute setting"""
        # Defensive attribute initialization
        self.base_url = str(base_url).rstrip('/') if base_url else "http://localhost:11434"
        self.timeout = int(timeout) if timeout else 30
        self.is_available = False
        self._client = None

        # Double-check attributes are set
        if not hasattr(self, 'timeout'):
            self.timeout = 30
        if not hasattr(self, 'base_url'):
            self.base_url = "http://localhost:11434"

        logger.info(f"OllamaService initialized: base_url={self.base_url}, timeout={self.timeout}")

    def _ensure_attributes(self):
        """Ensure all required attributes are set"""
        if not hasattr(self, 'timeout'):
            self.timeout = 30
            logger.warning("timeout attribute was missing, set to default 30")
        if not hasattr(self, 'base_url'):
            self.base_url = "http://localhost:11434"
            logger.warning("base_url attribute was missing, set to default")
        if not hasattr(self, 'is_available'):
            self.is_available = False
        if not hasattr(self, '_client'):
            self._client = None

    async def initialize(self) -> bool:
        """Initialize and test Ollama connection"""
        try:
            # Ensure attributes exist
            self._ensure_attributes()

            logger.info(f"Initializing Ollama service at {self.base_url}...")

            # Create HTTP client with timeout
            timeout_config = httpx.Timeout(
                timeout=self.timeout,
                connect=10.0,
                read=self.timeout,
                write=self.timeout
            )

            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=timeout_config,
                follow_redirects=True
            )

            # Test connection
            health_check = await self.health_check()

            if health_check.get('status') == 'healthy':
                self.is_available = True
                logger.info("✅ Ollama service connected successfully")

                # Try to get models
                try:
                    models = await self.list_models()
                    if models:
                        model_names = [m.get('name', 'unknown') for m in models[:3]]
                        logger.info(f"📋 Available models: {', '.join(model_names)}")
                    else:
                        logger.warning("⚠️  No models found")
                except Exception as e:
                    logger.warning(f"Could not list models: {e}")

                return True
            else:
                error_msg = health_check.get('error', 'Unknown error')
                logger.warning(f"❌ Ollama health check failed: {error_msg}")
                return False

        except Exception as e:
            logger.error(f"❌ Failed to initialize Ollama service: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            self.is_available = False
            return False

    async def health_check(self) -> Dict[str, Any]:
        """Check if Ollama service is healthy"""
        try:
            self._ensure_attributes()

            if not self._client:
                return {"status": "error", "error": "Client not initialized"}

            # Simple health check - just try to connect
            response = await self._client.get("/", timeout=10.0)

            if response.status_code == 200:
                return {
                    "status": "healthy",
                    "base_url": self.base_url
                }
            else:
                return {
                    "status": "unhealthy",
                    "error": f"HTTP {response.status_code}"
                }

        except httpx.ConnectError as e:
            return {
                "status": "unavailable",
                "error": f"Cannot connect to Ollama at {self.base_url}: {e}"
            }
        except httpx.TimeoutException:
            return {
                "status": "timeout",
                "error": f"Connection timeout after {getattr(self, 'timeout', 30)}s"
            }
        except Exception as e:
            return {
                "status": "error",
                "error": f"Health check failed: {str(e)}"
            }

    async def list_models(self) -> List[Dict[str, Any]]:
        """List available models"""
        try:
            self._ensure_attributes()

            if not self._client or not self.is_available:
                return []

            response = await self._client.get("/api/tags", timeout=10.0)

            if response.status_code == 200:
                data = response.json()
                return data.get("models", [])
            else:
                logger.error(f"Failed to list models: HTTP {response.status_code}")
                return []

        except Exception as e:
            logger.error(f"Error listing models: {e}")
            return []

    async def generate_response(
            self,
            prompt: str,
            context: str = "",
            model: str = None,
            max_tokens: int = 500,
            temperature: float = 0.7,
            top_p: float = 0.9,
            stream: bool = False,
            **kwargs
    ) -> str:
        """Generate response using Ollama with proper parameter handling"""
        try:
            if not self.is_available:
                logger.error("Ollama service is not available")
                raise Exception("Ollama service is not available")

            # Use default model if none specified
            model_name = model or self.default_model

            # Build the complete prompt with context
            if context and context.strip():
                full_prompt = f"""Context information:
    {context}

    Based on the context above, please answer the following question:
    {prompt}

    Answer:"""
            else:
                full_prompt = prompt

            # Prepare request data for Ollama API
            request_data = {
                "model": model_name,
                "prompt": full_prompt,
                "stream": stream,
                "options": {
                    "num_predict": max_tokens,  # Ollama uses num_predict instead of max_tokens
                    "temperature": temperature,
                    "top_p": top_p,
                    "stop": ["<|endoftext|>", "\n\nQuestion:", "\n\nContext:"],  # Stop sequences
                }
            }

            logger.info(f"🤖 Generating response with Ollama model: {model_name}")
            logger.info(f"📝 Prompt length: {len(full_prompt)} characters")

            # Make request to Ollama API
            timeout = aiohttp.ClientTimeout(total=60)  # 60 second timeout

            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                        f"{self.base_url}/api/generate",
                        json=request_data,
                        headers={"Content-Type": "application/json"}
                ) as response:

                    if response.status != 200:
                        error_text = await response.text()
                        logger.error(f"❌ Ollama API error {response.status}: {error_text}")
                        raise Exception(f"Ollama API error {response.status}: {error_text}")

                    if stream:
                        # Handle streaming response
                        full_response = ""
                        async for line in response.content:
                            if line:
                                try:
                                    line_data = json.loads(line.decode('utf-8'))
                                    if 'response' in line_data:
                                        full_response += line_data['response']
                                    if line_data.get('done', False):
                                        break
                                except json.JSONDecodeError:
                                    continue

                        result_text = full_response.strip()
                    else:
                        # Handle non-streaming response
                        result = await response.json()
                        result_text = result.get("response", "").strip()

                    if not result_text:
                        logger.warning("⚠️  Ollama returned empty response")
                        return "I couldn't generate a response. Please try rephrasing your question."

                    logger.info(f"✅ Generated response ({len(result_text)} characters)")
                    return result_text

        except aiohttp.ClientError as e:
            logger.error(f"❌ Network error calling Ollama: {e}")
            raise Exception(f"Network error: {e}")

        except asyncio.TimeoutError:
            logger.error("❌ Ollama request timeout")
            raise Exception("Request timeout - Ollama took too long to respond")

        except json.JSONDecodeError as e:
            logger.error(f"❌ Invalid JSON response from Ollama: {e}")
            raise Exception(f"Invalid response format: {e}")

        except Exception as e:
            logger.error(f"❌ Error generating response with Ollama: {e}")
            raise Exception(f"Failed to generate response: {e}")

    async def close(self):
        """Close the HTTP client"""
        try:
            if hasattr(self, '_client') and self._client:
                await self._client.aclose()
                self._client = None
            self.is_available = False
            logger.info("Ollama service connection closed")
        except Exception as e:
            logger.error(f"Error closing Ollama service: {e}")

# Don't create global instance here - let main.py handle it
