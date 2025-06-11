import logging
import aiohttp
import asyncio
from typing import List, Optional, Dict, Any
import json

logger = logging.getLogger(__name__)


class OllamaService:
    def __init__(self, host: str = "http://localhost:11434"):
        self.host = host
        self.session = None
        self.model = "llama3.2"  # Default model
        self.embedding_model = "nomic-embed-text"  # Default embedding model

    async def _get_session(self):
        """Get or create aiohttp session"""
        if self.session is None:
            self.session = aiohttp.ClientSession()
        return self.session

    async def close(self):
        """Close the aiohttp session"""
        if self.session:
            await self.session.close()
            self.session = None

    async def health_check(self) -> bool:
        """Check if Ollama service is available"""
        try:
            session = await self._get_session()
            async with session.get(f"{self.host}/api/tags") as response:
                return response.status == 200
        except Exception as e:
            logger.error(f"Ollama health check failed: {e}")
            return False

    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding for text"""
        try:
            session = await self._get_session()

            payload = {
                "model": self.embedding_model,
                "prompt": text
            }

            async with session.post(f"{self.host}/api/embeddings", json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get("embedding")
                else:
                    logger.error(f"Embedding generation failed with status {response.status}")
                    return None

        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return None

    async def generate_response(self, prompt: str, context: str = "") -> Optional[str]:
        """Generate text response"""
        try:
            session = await self._get_session()

            full_prompt = f"Context: {context}\n\nQuestion: {prompt}\n\nAnswer based on the context:" if context else prompt

            payload = {
                "model": self.model,
                "prompt": full_prompt,
                "stream": False
            }

            async with session.post(f"{self.host}/api/generate", json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    return result.get("response")
                elif response.status == 404:
                    logger.error(f"Model '{self.model}' not found. Available models can be checked with 'ollama list'")
                    return None
                else:
                    logger.error(f"Text generation failed with status {response.status}")
                    response_text = await response.text()
                    logger.error(f"Response: {response_text}")
                    return None

        except Exception as e:
            logger.error(f"Error generating response: {e}")
            return None