import logging
import hashlib
import os
from typing import Dict, List, Any, Tuple, Optional
import PyPDF2
from datetime import datetime
import re
import json
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class PDFProcessor:
    def __init__(self):
        self.chunk_size = 1000
        self.chunk_overlap = 200
        # Use your existing storage paths
        self.upload_dir = os.getenv("UPLOAD_DIR", "./storage/pdfs")
        os.makedirs(self.upload_dir, exist_ok=True)
        self.chroma_service = None

    async def initialize_chroma(self):
        """Initialize ChromaDB service if needed"""
        try:
            if not self.chroma_service:
                from app.services.chroma_service import ChromaService
                self.chroma_service = ChromaService()
                await self.chroma_service.initialize()
                logger.info("ChromaDB service initialized in PDF processor")
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")

    async def upload_and_process_pdf(
            self,
            file_content: bytes,
            filename: str,
            title: Optional[str] = None,
            category: Optional[str] = None,
            description: Optional[str] = None,
            db: Session = None
    ) -> Dict[str, Any]:
        """Main method to upload and process a PDF file"""
        try:
            # Import here to avoid circular imports
            from app.models.database_models import PDFDocument

            logger.info(f"Starting upload and processing for: {filename}")

            # Save the file
            file_path = self.save_file(file_content, filename)

            # Calculate file hash
            file_hash = self.calculate_file_hash(file_path)

            # Check if file already exists
            if db and file_hash:
                existing_pdf = db.query(PDFDocument).filter(
                    PDFDocument.file_hash == file_hash
                ).first()

                if existing_pdf:
                    logger.info(f"File already exists with ID: {existing_pdf.id}")
                    return {
                        "success": False,
                        "error": "File already exists",
                        "existing_id": existing_pdf.id,
                        "filename": filename
                    }

            # Get PDF metadata
            pdf_metadata = self.get_pdf_metadata(file_path)

            # Create database record with proper datetime
            current_time = datetime.utcnow()

            pdf_doc = PDFDocument(
                filename=filename,
                file_path=file_path,
                file_size=os.path.getsize(file_path),
                file_hash=file_hash,
                title=title or pdf_metadata.get("title"),
                category=category,
                description=description,
                status="uploaded",
                upload_date=current_time,  # Ensure this is set
                created_at=current_time,  # Ensure this is set
                updated_at=current_time,  # Ensure this is set
                processed=False,
                chunk_count=0
            )

            # Set metadata using our method
            pdf_doc.set_metadata(pdf_metadata)

            if db:
                db.add(pdf_doc)
                db.commit()
                db.refresh(pdf_doc)
                logger.info(f"Created database record with ID: {pdf_doc.id}")

            # Process the PDF
            chunks = await self.process_pdf(file_path)

            if chunks:
                # Update database with processing results
                pdf_doc.chunk_count = len(chunks)
                pdf_doc.processed = True
                pdf_doc.status = "processed"
                pdf_doc.updated_at = datetime.utcnow()

                if db:
                    db.commit()

                # Index in ChromaDB
                await self.initialize_chroma()
                if self.chroma_service:
                    await self.index_pdf_chunks(pdf_doc.id, chunks, pdf_doc)

                logger.info(f"Successfully processed PDF: {filename} ({len(chunks)} chunks)")

                return {
                    "success": True,
                    "id": pdf_doc.id,
                    "filename": filename,
                    "title": pdf_doc.title,
                    "category": pdf_doc.category,
                    "chunks": len(chunks),
                    "file_hash": file_hash,
                    "status": "processed",
                    "file_size": pdf_doc.file_size,
                    "upload_date": pdf_doc.upload_date  # This will now be a datetime object
                }
            else:
                # Processing failed
                pdf_doc.status = "failed"
                pdf_doc.processing_error = "No chunks could be extracted"
                pdf_doc.updated_at = datetime.utcnow()

                if db:
                    db.commit()

                logger.error(f"Failed to extract chunks from: {filename}")
                return {
                    "success": False,
                    "error": "Could not extract text from PDF",
                    "id": pdf_doc.id,
                    "filename": filename,
                    "upload_date": pdf_doc.upload_date
                }

        except Exception as e:
            logger.error(f"Error uploading and processing PDF: {e}")
            return {
                "success": False,
                "error": str(e),
                "filename": filename
            }

    async def index_pdf_chunks(self, pdf_id: int, chunks: List[Dict[str, Any]], pdf_doc) -> bool:
        """Index PDF chunks in ChromaDB"""
        try:
            if not self.chroma_service:
                logger.warning("ChromaDB service not initialized")
                return False

            # Prepare documents for ChromaDB
            documents = []
            metadatas = []
            ids = []

            for i, chunk in enumerate(chunks):
                doc_id = f"pdf_{pdf_id}_chunk_{i}"

                documents.append(chunk['content'])
                metadatas.append({
                    'pdf_id': pdf_id,
                    'filename': pdf_doc.filename,
                    'title': pdf_doc.title or pdf_doc.filename,
                    'category': pdf_doc.category or 'uncategorized',
                    'page_number': chunk.get('page_number', 1),
                    'chunk_index': i,
                    'word_count': chunk.get('word_count', 0),
                    'char_count': chunk.get('char_count', 0)
                })
                ids.append(doc_id)

            # Add to ChromaDB
            success = await self.chroma_service.add_documents(documents, metadatas, ids)

            if success:
                logger.info(f"Successfully indexed {len(chunks)} chunks for PDF {pdf_id}")
            else:
                logger.error(f"Failed to index chunks for PDF {pdf_id}")

            return success

        except Exception as e:
            logger.error(f"Error indexing PDF chunks: {e}")
            return False

    async def process_pdf(self, file_path: str) -> List[Dict[str, Any]]:
        """Async wrapper for processing PDF - returns chunks ready for ChromaDB"""
        try:
            logger.info(f"Processing PDF: {file_path}")

            # Validate the PDF first
            is_valid, validation_message = self.validate_pdf(file_path)
            if not is_valid:
                logger.error(f"PDF validation failed: {validation_message}")
                return []

            # Use your existing method
            chunks = self.process_pdf_to_chunks(file_path)

            if not chunks:
                logger.warning(f"No chunks extracted from {file_path}")
                return []

            # Format chunks for ChromaDB
            formatted_chunks = []
            for chunk in chunks:
                formatted_chunks.append({
                    'content': chunk.get('text', ''),
                    'page_number': chunk.get('page_number', 1),
                    'chunk_index': chunk.get('chunk_index', 0),
                    'char_count': chunk.get('char_count', 0),
                    'word_count': chunk.get('word_count', 0),
                    'keywords': chunk.get('keywords', [])
                })

            logger.info(f"Formatted {len(formatted_chunks)} chunks for indexing")
            return formatted_chunks

        except Exception as e:
            logger.error(f"Error in async PDF processing: {e}")
            return []

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
        """Extract metadata from PDF - compatible with your existing schema"""
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
                "file_hash": None,
                "processing_date": datetime.utcnow().isoformat(),
                "processor_version": "1.0"
            }

            # Calculate file hash
            with open(file_path, 'rb') as file:
                file_content = file.read()
                metadata["file_hash"] = hashlib.sha256(file_content).hexdigest()

            # Extract PDF metadata
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                metadata["total_pages"] = len(pdf_reader.pages)

                if pdf_reader.metadata:
                    metadata.update({
                        "title": str(pdf_reader.metadata.get('/Title', '')).strip() or None,
                        "author": str(pdf_reader.metadata.get('/Author', '')).strip() or None,
                        "subject": str(pdf_reader.metadata.get('/Subject', '')).strip() or None,
                        "creator": str(pdf_reader.metadata.get('/Creator', '')).strip() or None,
                        "producer": str(pdf_reader.metadata.get('/Producer', '')).strip() or None,
                        "creation_date": str(pdf_reader.metadata.get('/CreationDate', '')).strip() or None,
                        "modification_date": str(pdf_reader.metadata.get('/ModDate', '')).strip() or None
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
                "subject": None,
                "error": str(e),
                "processing_date": datetime.utcnow().isoformat()
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

    def save_file(self, file_content: bytes, filename: str) -> str:
        """Save uploaded file to your existing storage directory"""
        try:
            # Create a unique filename to avoid conflicts
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_filename = re.sub(r'[^\w\-_\.]', '_', filename)
            unique_filename = f"{timestamp}_{safe_filename}"

            file_path = os.path.join(self.upload_dir, unique_filename)

            # Save the file
            with open(file_path, 'wb') as f:
                f.write(file_content)

            logger.info(f"File saved to: {file_path}")
            return file_path

        except Exception as e:
            logger.error(f"Error saving file: {e}")
            raise

    def calculate_file_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file"""
        try:
            with open(file_path, 'rb') as f:
                file_content = f.read()
                return hashlib.sha256(file_content).hexdigest()
        except Exception as e:
            logger.error(f"Error calculating file hash: {e}")
            return None

    def get_processing_summary(self, file_path: str, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Get a summary of the processing results"""
        try:
            metadata = self.get_pdf_metadata(file_path)

            return {
                "file_path": file_path,
                "file_size": metadata.get("file_size", 0),
                "total_pages": metadata.get("total_pages", 0),
                "total_chunks": len(chunks),
                "total_words": sum(chunk.get("word_count", 0) for chunk in chunks),
                "total_chars": sum(chunk.get("char_count", 0) for chunk in chunks),
                "file_hash": metadata.get("file_hash"),
                "processing_date": datetime.utcnow().isoformat(),
                "pdf_metadata": {
                    "title": metadata.get("title"),
                    "author": metadata.get("author"),
                    "subject": metadata.get("subject"),
                    "creator": metadata.get("creator")
                }
            }
        except Exception as e:
            logger.error(f"Error creating processing summary: {e}")
            return {
                "file_path": file_path,
                "error": str(e),
                "processing_date": datetime.utcnow().isoformat()
            }

    def cleanup_temp_files(self, file_path: str):
        """Clean up temporary files if needed"""
        try:
            # Only remove if it's in a temp directory, not your main storage
            if "/tmp/" in file_path or "\\temp\\" in file_path:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Cleaned up temp file: {file_path}")
        except Exception as e:
            logger.warning(f"Could not clean up temp file {file_path}: {e}")

    # Database helper methods
    def get_pdf_by_id(self, pdf_id: int, db: Session):
        """Get PDF document by ID"""
        try:
            from app.models.database_models import PDFDocument
            return db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
        except Exception as e:
            logger.error(f"Error getting PDF by ID: {e}")
            return None

    def list_pdfs(self, db: Session, skip: int = 0, limit: int = 100):
        """List all PDF documents"""
        try:
            from app.models.database_models import PDFDocument
            return db.query(PDFDocument).offset(skip).limit(limit).all()
        except Exception as e:
            logger.error(f"Error listing PDFs: {e}")
            return []

    def get_pdf_stats(self, db: Session) -> Dict[str, Any]:
        """Get PDF statistics"""
        try:
            from app.models.database_models import PDFDocument

            total_pdfs = db.query(PDFDocument).count()
            processed_pdfs = db.query(PDFDocument).filter(PDFDocument.processed == True).count()
            failed_pdfs = db.query(PDFDocument).filter(PDFDocument.status == 'failed').count()
            processing_pdfs = db.query(PDFDocument).filter(PDFDocument.status == 'processing').count()

            return {
                "total_pdfs": total_pdfs,
                "searchable_pdfs": processed_pdfs,  # For compatibility with frontend
                "processed_pdfs": processed_pdfs,
                "failed_pdfs": failed_pdfs,
                "processing_pdfs": processing_pdfs,
                "total_searches": 0  # Will be updated when we implement search logging
            }
        except Exception as e:
            logger.error(f"Error getting PDF stats: {e}")
            return {
                "total_pdfs": 0,
                "searchable_pdfs": 0,
                "processed_pdfs": 0,
                "failed_pdfs": 0,
                "processing_pdfs": 0,
                "total_searches": 0
            }

    async def reprocess_pdf(self, pdf_id: int, db: Session) -> Dict[str, Any]:
        """Reprocess an existing PDF"""
        try:
            from app.models.database_models import PDFDocument

            # Get the PDF record
            pdf_doc = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
            if not pdf_doc:
                return {"success": False, "error": "PDF not found"}

            # Check if file still exists
            if not os.path.exists(pdf_doc.file_path):
                return {"success": False, "error": "PDF file not found on disk"}

            # Update status to processing
            pdf_doc.status = "processing"
            pdf_doc.processing_error = None
            db.commit()

            # Process the PDF
            chunks = await self.process_pdf(pdf_doc.file_path)

            if chunks:
                # Update database with processing results
                pdf_doc.chunk_count = len(chunks)
                pdf_doc.processed = True
                pdf_doc.status = "processed"
                pdf_doc.updated_at = datetime.utcnow()
                db.commit()

                # Re-index in ChromaDB
                await self.initialize_chroma()
                if self.chroma_service:
                    # Remove old chunks first
                    await self.chroma_service.delete_documents_by_pdf_id(pdf_id)
                    # Add new chunks
                    await self.index_pdf_chunks(pdf_id, chunks, pdf_doc)

                logger.info(f"Successfully reprocessed PDF {pdf_id}: {pdf_doc.filename}")

                return {
                    "success": True,
                    "id": pdf_id,
                    "filename": pdf_doc.filename,
                    "chunks": len(chunks),
                    "status": "processed"
                }
            else:
                # Processing failed
                pdf_doc.status = "failed"
                pdf_doc.processing_error = "No chunks could be extracted during reprocessing"
                db.commit()

                return {
                    "success": False,
                    "error": "Could not extract text from PDF during reprocessing",
                    "id": pdf_id
                }

        except Exception as e:
            logger.error(f"Error reprocessing PDF {pdf_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def delete_pdf(self, pdf_id: int, db: Session) -> Dict[str, Any]:
        """Delete a PDF and its associated data"""
        try:
            from app.models.database_models import PDFDocument

            # Get the PDF record
            pdf_doc = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
            if not pdf_doc:
                return {"success": False, "error": "PDF not found"}

            filename = pdf_doc.filename
            file_path = pdf_doc.file_path

            # Remove from ChromaDB
            await self.initialize_chroma()
            if self.chroma_service:
                await self.chroma_service.delete_documents_by_pdf_id(pdf_id)

            # Delete file from disk
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Deleted file: {file_path}")
            except Exception as e:
                logger.warning(f"Could not delete file {file_path}: {e}")

            # Delete from database
            db.delete(pdf_doc)
            db.commit()

            logger.info(f"Successfully deleted PDF {pdf_id}: {filename}")

            return {
                "success": True,
                "id": pdf_id,
                "filename": filename,
                "message": "PDF deleted successfully"
            }

        except Exception as e:
            logger.error(f"Error deleting PDF {pdf_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_pdf_content(self, pdf_id: int, db: Session) -> Optional[bytes]:
        """Get PDF file content for viewing/downloading"""
        try:
            from app.models.database_models import PDFDocument

            pdf_doc = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
            if not pdf_doc:
                return None

            if not os.path.exists(pdf_doc.file_path):
                logger.error(f"PDF file not found: {pdf_doc.file_path}")
                return None

            with open(pdf_doc.file_path, 'rb') as f:
                return f.read()

        except Exception as e:
            logger.error(f"Error getting PDF content: {e}")
            return None

    async def search_pdfs(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Search through indexed PDFs using ChromaDB"""
        try:
            await self.initialize_chroma()
            if not self.chroma_service:
                return {"success": False, "error": "Search service not available"}

            # Search using ChromaDB
            results = await self.chroma_service.search_documents(query, limit)

            if results:
                return {
                    "success": True,
                    "query": query,
                    "results": results,
                    "count": len(results)
                }
            else:
                return {
                    "success": True,
                    "query": query,
                    "results": [],
                    "count": 0
                }

        except Exception as e:
            logger.error(f"Error searching PDFs: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def rag_query(self, question: str, limit: int = 5) -> Dict[str, Any]:
        """Perform RAG query using ChromaDB and Ollama"""
        try:
            await self.initialize_chroma()
            if not self.chroma_service:
                return {"success": False, "error": "Search service not available"}

            # Search for relevant documents
            search_results = await self.chroma_service.search_documents(question, limit)

            if not search_results:
                return {
                    "success": True,
                    "question": question,
                    "answer": "I couldn't find any relevant information in the documents to answer your question.",
                    "sources": []
                }

            # Try to use Ollama for generating answer
            try:
                from app.services.ollama_service import OllamaService
                ollama_service = OllamaService()

                # Prepare context from search results
                context = "\n\n".join([
                    f"From {result.get('filename', 'Unknown')}: {result.get('content', '')}"
                    for result in search_results[:3]  # Use top 3 results
                ])

                # Generate answer
                answer = await ollama_service.generate_answer(question, context)

                return {
                    "success": True,
                    "question": question,
                    "answer": answer,
                    "sources": search_results,
                    "context_used": len(search_results)
                }

            except Exception as ollama_error:
                logger.warning(f"Ollama not available, returning search results: {ollama_error}")

                # Fallback: return search results without generated answer
                return {
                    "success": True,
                    "question": question,
                    "answer": f"Based on the documents, here are the most relevant excerpts:\n\n" +
                              "\n\n".join([f"• {result.get('content', '')[:200]}..."
                                           for result in search_results[:3]]),
                    "sources": search_results,
                    "note": "Generated using search results (Ollama not available)"
                }

        except Exception as e:
            logger.error(f"Error in RAG query: {e}")
            return {
                "success": False,
                "error": str(e)
            }