#!/bin/bash

echo "Setting up RAG PDF Search API..."

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create necessary directories
mkdir -p storage/pdfs storage/chroma logs

# Download NLTK data
python -c "import nltk; nltk.download('punkt'); nltk.download('stopwords')"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file. Please update it with your configuration."
fi

echo "Setup completed!"
echo "To start the application:"
echo "1. Start Ollama service"
echo "2. Pull required models: ollama pull llama2 && ollama pull nomic-embed-text"
echo "3. Run: python -m app.main"