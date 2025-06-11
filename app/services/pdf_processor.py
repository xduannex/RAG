import logging
import hashlib
import os
from typing import Dict, List, Any, Tuple, Optional
import PyPDF2
from datetime import datetime
import re

logger = logging.getLogger(__name__)


class PDFProcessor:
    def __init__(self):
        self.chunk_size = 1000
        self.chunk_overlap = 200

    def validate_pdf(self, file_path: str) -> Tuple[bool, str]:
        """Validate if the file is a proper PDF"""
        try:
            if not os.path.exists(file_path):
                return False, "File does not exist"

            if not file_path.lower().endswith('.pdf'):
                return False, "File is not a PDF"

            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)

                if len(pdf_reader.pages) == 0:
                    return False, "PDF has no pages"

                # Try to read first page
                first_page = pdf_reader.pages[0]
                text = first_page.extract_text()

                return True, "Valid PDF"

        except Exception as e:
            return False, f"PDF validation error: {str(e)}"

    def get_pdf_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract metadata from PDF"""
        try:
            metadata = {
                "file_size": os.path.getsize(file_path),
                "total_pages": 0,
                "title": None,
                "author": None,
                "subject": None,
                "creator": None,
                "producer": None,
                "creation_date": None,
                "modification_date": None,
                "file_hash": None
            }

            # Calculate file hash
            with open(file_path, 'rb') as file:
                file_content = file.read()
                metadata["file_hash"] = hashlib.md5(file_content).hexdigest()

            # Extract PDF metadata
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                metadata["total_pages"] = len(pdf_reader.pages)

                if pdf_reader.metadata:
                    metadata.update({
                        "title": pdf_reader.metadata.get('/Title'),
                        "author": pdf_reader.metadata.get('/Author'),
                        "subject": pdf_reader.metadata.get('/Subject'),
                        "creator": pdf_reader.metadata.get('/Creator'),
                        "producer": pdf_reader.metadata.get('/Producer'),
                        "creation_date": pdf_reader.metadata.get('/CreationDate'),
                        "modification_date": pdf_reader.metadata.get('/ModDate')
                    })

            return metadata

        except Exception as e:
            logger.error(f"Error extracting PDF metadata: {e}")
            return {
                "file_size": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
                "total_pages": 0,
                "file_hash": None,
                "title": None,
                "author": None,
                "subject": None
            }

    def extract_text_from_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        """Extract text from PDF page by page"""
        pages_text = []

        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)

                for page_num, page in enumerate(pdf_reader.pages, 1):
                    try:
                        text = page.extract_text()

                        if text.strip():
                            pages_text.append({
                                "page_number": page_num,
                                "text": text.strip(),
                                "char_count": len(text),
                                "word_count": len(text.split())
                            })
                        else:
                            logger.warning(f"No text found on page {page_num}")

                    except Exception as e:
                        logger.error(f"Error extracting text from page {page_num}: {e}")
                        continue

        except Exception as e:
            logger.error(f"Error reading PDF file: {e}")

        return pages_text

    def simple_sentence_split(self, text: str) -> List[str]:
        """Simple sentence splitting without NLTK"""
        # Split on sentence endings
        sentences = re.split(r'[.!?]+\s+', text)
        return [s.strip() for s in sentences if s.strip()]

    def create_chunks(self, text: str, page_number: int) -> List[Dict[str, Any]]:
        """Split text into chunks without NLTK"""
        chunks = []

        if not text.strip():
            return chunks

        text_length = len(text)
        start = 0
        chunk_index = 0

        while start < text_length:
            end = start + self.chunk_size

            # Try to break at sentence boundary
            if end < text_length:
                # Look for sentence endings near the chunk boundary
                search_start = max(start, end - self.chunk_overlap)
                search_end = min(text_length, end + self.chunk_overlap)
                search_text = text[search_start:search_end]

                # Find sentence endings
                sentence_endings = []
                for match in re.finditer(r'[.!?]\s+', search_text):
                    sentence_endings.append(search_start + match.end())

                if sentence_endings:
                    # Use the closest sentence ending to our target
                    closest_ending = min(sentence_endings, key=lambda x: abs(x - end))
                    if closest_ending > start + 200:  # Minimum chunk size
                        end = closest_ending

            chunk_text = text[start:end].strip()

            if chunk_text:
                chunks.append({
                    "page_number": page_number,
                    "chunk_index": chunk_index,
                    "text": chunk_text,
                    "char_count": len(chunk_text),
                    "word_count": len(chunk_text.split()),
                    "position": {"start": start, "end": end},
                    "keywords": self.extract_keywords_simple(chunk_text)
                })

                chunk_index += 1

            start = end - self.chunk_overlap

        return chunks

    def extract_keywords_simple(self, text: str) -> List[str]:
        """Simple keyword extraction without NLTK"""
        try:
            # Convert to lowercase and split into words
            words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())

            # Common stop words to remove
            stop_words = {
                'this', 'that', 'with', 'have', 'will', 'from', 'they', 'know',
                'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when',
                'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over',
                'such', 'take', 'than', 'them', 'well', 'were', 'what', 'your',
                'about', 'after', 'again', 'before', 'being', 'could', 'every',
                'first', 'found', 'great', 'group', 'large', 'last', 'little',
                'most', 'never', 'only', 'other', 'place', 'right', 'same',
                'should', 'small', 'still', 'their', 'there', 'these', 'think',
                'three', 'through', 'under', 'until', 'where', 'while', 'world',
                'would', 'write', 'years', 'young'
            }

            # Filter out stop words
            keywords = [word for word in words if word not in stop_words]

            # Count frequency and return top keywords
            from collections import Counter
            word_freq = Counter(keywords)
            top_keywords = [word for word, count in word_freq.most_common(10)]

            return top_keywords

        except Exception as e:
            logger.warning(f"Simple keyword extraction failed: {e}")
            return []

    def process_pdf_to_chunks(self, file_path: str) -> List[Dict[str, Any]]:
        """Process PDF and return chunks"""
        try:
            logger.info(f"Processing PDF: {file_path}")

            # Extract text from all pages
            pages_text = self.extract_text_from_pdf(file_path)

            if not pages_text:
                logger.warning("No text extracted from PDF")
                return []

            # Create chunks from all pages
            all_chunks = []

            for page_data in pages_text:
                page_chunks = self.create_chunks(
                    page_data["text"],
                    page_data["page_number"]
                )
                all_chunks.extend(page_chunks)

            logger.info(f"Created {len(all_chunks)} chunks from {len(pages_text)} pages")
            return all_chunks

        except Exception as e:
            logger.error(f"Error processing PDF to chunks: {e}")
            return []


def process_word_document(self, file_path: str) -> Dict[str, Any]:
    """Process Word document and extract text"""
    try:
        doc = Document(file_path)

        # Extract text from paragraphs
        full_text = []
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                full_text.append(paragraph.text.strip())

        # Extract text from tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text.strip():
                        full_text.append(cell.text.strip())

        combined_text = '\n'.join(full_text)

        # Get document properties
        props = doc.core_properties

        # Get file stats
        file_stats = os.stat(file_path)

        return {
            "text": combined_text,
            "page_count": 1,  # Word docs don't have pages like PDFs
            "word_count": len(combined_text.split()),
            "char_count": len(combined_text),
            "title": props.title or "",
            "author": props.author or "",
            "subject": props.subject or "",
            "created": props.created,
            "modified": props.modified,
            "file_size": file_stats.st_size
        }

    except Exception as e:
        logger.error(f"Error processing Word document {file_path}: {e}")
        return None


def validate_word_document(self, file_path: str) -> tuple[bool, str]:
    """Validate Word document"""
    try:
        doc = Document(file_path)
        # Try to access basic properties
        _ = doc.paragraphs
        return True, "Valid Word document"
    except Exception as e:
        return False, f"Invalid Word document: {str(e)}"


def process_word_to_chunks(self, file_path: str, chunk_size: int = 1000) -> List[Dict[str, Any]]:
    """Process Word document into chunks"""
    try:
        doc_data = self.process_word_document(file_path)
        if not doc_data:
            return []

        text = doc_data["text"]
        if not text.strip():
            return []

        # Split into chunks
        chunks = []
        words = text.split()

        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i + chunk_size]
            chunk_text = ' '.join(chunk_words)

            if chunk_text.strip():
                # Extract keywords (simple approach)
                keywords = self._extract_keywords(chunk_text)

                chunk = {
                    "text": chunk_text,
                    "page_number": 1,  # Word docs treated as single page
                    "chunk_index": len(chunks),
                    "position": i,
                    "char_count": len(chunk_text),
                    "word_count": len(chunk_words),
                    "keywords": keywords
                }
                chunks.append(chunk)

        return chunks

    except Exception as e:
        logger.error(f"Error processing Word document to chunks: {e}")
        return []