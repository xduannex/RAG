import re
from typing import List, Tuple
import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords

# Download required NLTK data (run once)
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')


class TextProcessor:
    def __init__(self):
        self.stop_words = set(stopwords.words('english'))

    def clean_text(self, text: str) -> str:
        """Clean and normalize text"""
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)

        # Remove special characters but keep basic punctuation
        text = re.sub(r'[^\w\s\.\,\!\?\;\:\-\(\)]', '', text)

        # Remove multiple consecutive punctuation
        text = re.sub(r'[\.]{2,}', '.', text)

        return text.strip()

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[Tuple[str, int]]:
        """Split text into overlapping chunks with position tracking"""
        sentences = sent_tokenize(text)
        chunks = []
        current_chunk = ""
        current_position = 0

        for sentence in sentences:
            # If adding this sentence would exceed chunk size
            if len(current_chunk) + len(sentence) > chunk_size and current_chunk:
                chunks.append((current_chunk.strip(), current_position))

                # Create overlap by keeping last few sentences
                words = word_tokenize(current_chunk)
                if len(words) > overlap:
                    overlap_text = ' '.join(words[-overlap:])
                    current_chunk = overlap_text + " " + sentence
                else:
                    current_chunk = sentence

                current_position = len(chunks)
            else:
                current_chunk += " " + sentence if current_chunk else sentence

        # Add the last chunk
        if current_chunk:
            chunks.append((current_chunk.strip(), current_position))

        return chunks

    def extract_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """Extract keywords from text"""
        words = word_tokenize(text.lower())
        keywords = [word for word in words
                    if word.isalpha() and
                    word not in self.stop_words and
                    len(word) > 3]

        # Simple frequency-based keyword extraction
        word_freq = {}
        for word in keywords:
            word_freq[word] = word_freq.get(word, 0) + 1

        # Sort by frequency and return top keywords
        sorted_keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, freq in sorted_keywords[:max_keywords]]