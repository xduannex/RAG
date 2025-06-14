import logging
import httpx
import json
from typing import Dict, Any, Optional, List
from app.config.settings import settings

logger = logging.getLogger(__name__)


class OllamaService:
    def __init__(self):
        self.base_url = getattr(settings, 'ollama_base_url', "http://localhost:11434")
        self.client = None
        self.available_models = []
        self.generation_models = []  # Models that can generate text
        self.embedding_models = []  # Models for embeddings only
        self._initialized = False

    def _categorize_models(self):
        """Categorize models into generation and embedding models"""
        self.generation_models = []
        self.embedding_models = []

        # Known embedding model patterns (more comprehensive)
        embedding_patterns = [
            'embed', 'embedding', 'nomic-embed', 'sentence-transformer',
            'bge-', 'e5-', 'gte-', 'instructor-'
        ]

        # Known generation model families
        generation_families = [
            'llama', 'qwen', 'phi', 'deepseek', 'mistral', 'codellama',
            'vicuna', 'alpaca', 'gemma', 'neural-chat', 'openchat',
            'starling', 'zephyr', 'orca', 'wizard'
        ]

        for model in self.available_models:
            model_lower = model.lower()
            model_name = model_lower.split(':')[0]  # Get base name without tag

            # Check if it's an embedding model first (more specific)
            is_embedding = any(pattern in model_lower for pattern in embedding_patterns)

            if is_embedding:
                self.embedding_models.append(model)
                logger.info(f"Categorized {model} as embedding model")
            else:
                # Check if it's a known generation model family
                is_generation = any(family in model_name for family in generation_families)

                if is_generation:
                    self.generation_models.append(model)
                    logger.info(f"Categorized {model} as generation model")
                else:
                    # For unknown models, try to determine by size or default to generation
                    # Most models are generation models unless specifically embedding
                    self.generation_models.append(model)
                    logger.info(f"Unknown model type for {model}, defaulting to generation model")

    async def initialize(self) -> bool:
        """Initialize Ollama service and check availability"""
        try:
            if self._initialized:
                return True

            logger.info(f"Initializing Ollama service at {self.base_url}...")

            # Create HTTP client with longer timeout
            self.client = httpx.AsyncClient(timeout=30.0)

            # Check if Ollama is available
            is_available = await self.is_available()

            if not is_available:
                logger.warning("Ollama service not available")
                self._initialized = False
                return False

            # Get available models
            self.available_models = await self.get_available_models()

            if not self.available_models:
                logger.warning("No models found in Ollama")
                self._initialized = False
                return False

            # Categorize models BEFORE testing
            self._categorize_models()

            logger.info(f"Ollama model categorization complete:")
            logger.info(f"  - Total models: {len(self.available_models)}")
            logger.info(f"  - Generation models: {self.generation_models}")
            logger.info(f"  - Embedding models: {self.embedding_models}")

            # Test with a generation model if available
            if self.generation_models:
                test_model = self.generation_models[0]
                logger.info(f"Testing Ollama with generation model: {test_model}")

                try:
                    test_response = await self.generate_response(
                        prompt="Hi",
                        model=test_model,
                        max_tokens=5
                    )
                    if not test_response.get("error"):
                        logger.info("Ollama test generation successful")
                    else:
                        logger.warning(f"Ollama test failed: {test_response.get('error')}")
                        # Don't fail initialization if test fails, model might still work
                except Exception as e:
                    logger.warning(f"Ollama test generation failed: {e}")
                    # Don't fail initialization
            else:
                logger.warning("No generation models available for testing")

            self._initialized = True
            return len(self.generation_models) > 0  # Only succeed if we have generation models

        except Exception as e:
            logger.error(f"Failed to initialize Ollama service: {e}")
            self._initialized = False
            return False

    async def is_available(self) -> bool:
        """Check if Ollama service is available"""
        try:
            if not self.client:
                self.client = httpx.AsyncClient(timeout=10.0)

            response = await self.client.get(f"{self.base_url}/api/tags")
            available = response.status_code == 200
            if available:
                logger.info("Ollama service is available")
            else:
                logger.warning(f"Ollama service returned status: {response.status_code}")
            return available
        except Exception as e:
            logger.debug(f"Ollama not available: {e}")
            return False

    async def get_available_models(self) -> List[str]:
        """Get list of available models"""
        try:
            if not self.client:
                self.client = httpx.AsyncClient(timeout=10.0)

            response = await self.client.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models = [model["name"] for model in data.get("models", [])]
                logger.info(f"Found {len(models)} total models: {models}")
                return models
            else:
                logger.error(f"Failed to get models: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error getting available models: {e}")
            return []

    def get_best_model_for_task(self, task: str = "general") -> Optional[str]:
        """Get the best available model for a specific task"""
        if task == "embedding":
            if self.embedding_models:
                best_embedding = self.embedding_models[0]
                logger.info(f"Selected embedding model: {best_embedding}")
                return best_embedding
            else:
                logger.warning("No embedding models available")
                return None

        # For generation tasks, use generation models only
        if not self.generation_models:
            logger.error("No generation models available")
            return None

        # Preference order for different generation tasks
        model_preferences = {
            "general": [
                "llama3.2:latest",
                "qwen2.5:latest",
                "deepseek-r1:7b",
                "phi3.5:latest",
                "qwen2.5:1.5b"
            ],
            "coding": [
                "qwen2.5-coder:latest",
                "deepseek-r1:7b",
                "qwen2.5:latest",
                "llama3.2:latest"
            ]
        }

        preferred_models = model_preferences.get(task, model_preferences["general"])

        # Find the first available preferred model
        for preferred in preferred_models:
            if preferred in self.generation_models:
                logger.info(f"Selected preferred model for {task}: {preferred}")
                return preferred

        # If no preferred model found, return the first available generation model
        best_model = self.generation_models[0]
        logger.info(f"Selected first available generation model: {best_model}")
        return best_model

    async def generate_response(
            self,
            prompt: str,
            model: Optional[str] = None,
            stream: bool = False,
            temperature: float = 0.7,
            max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """Generate response using Ollama"""
        try:
            if not self.client:
                self.client = httpx.AsyncClient(timeout=120.0)

            # Use best available generation model if none specified
            if not model:
                model = self.get_best_model_for_task("general")
                if not model:
                    return {"error": "No generation models available"}
            else:
                # Validate the specified model
                if model in self.embedding_models:
                    logger.warning(f"Model {model} is an embedding model, switching to generation model")
                    model = self.get_best_model_for_task("general")
                    if not model:
                        return {"error": "No generation models available"}
                elif model not in self.generation_models:
                    logger.warning(f"Model {model} not found in generation models, using best available")
                    model = self.get_best_model_for_task("general")
                    if not model:
                        return {"error": "No generation models available"}

            logger.info(f"Generating response with model: {model}")

            payload = {
                "model": model,
                "prompt": prompt,
                "stream": stream,
                "options": {
                    "temperature": temperature,
                    "num_ctx": 4096,
                }
            }

            if max_tokens:
                payload["options"]["num_predict"] = max_tokens

            response = await self.client.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=120.0
            )

            if response.status_code == 200:
                result = response.json()
                generated_text = result.get("response", "")

                logger.info(f"Successfully generated response ({len(generated_text)} chars)")

                return {
                    "response": generated_text,
                    "model": model,
                    "done": result.get("done", True),
                    "context": result.get("context", []),
                    "total_duration": result.get("total_duration", 0),
                    "load_duration": result.get("load_duration", 0),
                    "prompt_eval_count": result.get("prompt_eval_count", 0),
                    "eval_count": result.get("eval_count", 0)
                }
            else:
                error_msg = f"Ollama API error: {response.status_code} - {response.text}"
                logger.error(error_msg)
                return {"error": error_msg}

        except Exception as e:
            error_msg = f"Error generating response: {e}"
            logger.error(error_msg)
            return {"error": error_msg}

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about available models"""
        return {
            "total_models": len(self.available_models),
            "all_models": self.available_models,
            "generation_models": self.generation_models,
            "embedding_models": self.embedding_models,
            "recommended_generation": self.get_best_model_for_task("general"),
            "recommended_embedding": self.get_best_model_for_task("embedding"),
            "initialized": self._initialized
        }

    async def close(self):
        """Close the HTTP client"""
        if self.client:
            await self.client.aclose()
            self.client = None
            logger.info("Ollama service client closed")
