import os
import tempfile
import shutil
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

from app.services.document_processor import DocumentProcessor
from app.config.settings import settings

logger = logging.getLogger(__name__)

class UploadHandler:
    """Handle file uploads without adding date prefixes"""

    def __init__(self):
        self.processor = DocumentProcessor()
        self.upload_dir = Path(settings.upload_dir)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def save_uploaded_file(
        self,
        file_content: bytes,
        original_filename: str,
        preserve_original_name: bool = False
    ) -> str:
        """Save uploaded file without adding date prefixes"""

        # Clean the original filename
        clean_filename = self._clean_uploaded_filename(original_filename)

        if preserve_original_name:
            # Use original filename as-is (cleaned)
            final_filename = clean_filename
        else:
            # Let the processor handle renaming if needed
            final_filename = clean_filename

        # Create full path
        file_path = self.upload_dir / final_filename

        # Handle duplicate filenames by adding counter
        file_path = self._handle_duplicate_path(file_path)

        # Save the file
        with open(file_path, 'wb') as f:
            f.write(file_content)

        logger.info(f"File saved as: {file_path}")
        return str(file_path)

    def _clean_uploaded_filename(self, filename: str) -> str:
        """Clean uploaded filename without adding dates"""
        import re

        # Remove any existing date prefixes that might be present
        clean_name = re.sub(r'^\d{4}[-_]\d{2}[-_]\d{2}[-_]?', '', filename)
        clean_name = re.sub(r'^\d{8}[-_]?', '', clean_name)
        clean_name = re.sub(r'^\d{10,}[-_]?', '', clean_name)

        # Remove problematic characters but keep the original structure
        clean_name = re.sub(r'[<>:"/\\|?*]', '_', clean_name)
        clean_name = re.sub(r'\s+', ' ', clean_name)
        clean_name = clean_name.strip()

        return clean_name or filename

    def _handle_duplicate_path(self, file_path: Path) -> Path:
        """Handle duplicate file paths by adding counter"""
        if not file_path.exists():
            return file_path

        base_name = file_path.stem
        suffix = file_path.suffix
        parent = file_path.parent
        counter = 1

        while file_path.exists():
            new_name = f"{base_name}_{counter}{suffix}"
            file_path = parent / new_name
            counter += 1

        return file_path

    def process_uploaded_document(
            self,
            file_path: str,
            original_filename: str,
            existing_files: Optional[List[Dict[str, Any]]] = None,
            auto_rename_generic: bool = True
    ) -> Dict[str, Any]:
        """Process uploaded document with enhanced duplicate detection"""

        try:
            # Process the document
            chunks, metadata = self.processor.process_document(
                file_path=file_path,
                original_filename=original_filename,
                auto_rename_generic=auto_rename_generic,
                check_duplicates=True,
                existing_files=existing_files or []
            )

            # Determine processing status
            status = "success"
            messages = []

            # Check for duplicates
            if metadata.get('has_content_duplicate'):
                status = "duplicate_content"
                messages.append(
                    f"File content is identical to existing document (ID: {metadata['content_duplicate_id']})")

            if metadata.get('has_filename_duplicate'):
                if status != "duplicate_content":
                    status = "duplicate_filename"
                messages.append(f"Filename already exists (ID: {metadata['filename_duplicate_id']})")

            # Check for renaming
            if metadata.get('was_renamed'):
                reason = metadata.get('rename_reason', 'unknown')
                old_name = metadata.get('original_filename', '')
                new_name = metadata.get('final_filename', '')

                if reason == 'generic_filename':
                    messages.append(f"File renamed from generic name '{old_name}' to '{new_name}' based on content")
                else:
                    messages.append(f"File renamed from '{old_name}' to '{new_name}'")

            # Prepare result
            result = {
                'status': status,
                'messages': messages,
                'file_path': metadata.get('file_path', file_path),
                'metadata': metadata,
                'chunks': chunks,
                'display_name': self.processor.get_display_name(metadata),
                'processing_info': {
                    'chunk_count': len(chunks),
                    'word_count': metadata.get('word_count', 0),
                    'file_size': metadata.get('file_size', 0),
                    'file_type': metadata.get('file_type', ''),
                    'extracted_title': metadata.get('extracted_title'),
                    'keywords': metadata.get('keywords', [])
                }
            }

            return result

        except Exception as e:
            logger.error(f"Error processing document {file_path}: {e}")
            return {
                'status': 'error',
                'messages': [f"Processing failed: {str(e)}"],
                'file_path': file_path,
                'metadata': None,
                'chunks': [],
                'display_name': original_filename,
                'processing_info': None
            }

    def handle_bulk_upload(
            self,
            files: List[tuple],  # [(file_content, filename), ...]
            existing_files: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Handle multiple file uploads"""

        results = []
        successful = 0
        duplicates = 0
        errors = 0

        for file_content, filename in files:
            try:
                # Save file
                file_path = self.save_uploaded_file(file_content, filename)

                # Process document
                result = self.process_uploaded_document(
                    file_path,
                    filename,
                    existing_files
                )

                results.append({
                    'filename': filename,
                    'result': result
                })

                # Update counters
                if result['status'] == 'success':
                    successful += 1
                elif result['status'].startswith('duplicate'):
                    duplicates += 1
                else:
                    errors += 1

            except Exception as e:
                logger.error(f"Error handling file {filename}: {e}")
                results.append({
                    'filename': filename,
                    'result': {
                        'status': 'error',
                        'messages': [f"Upload failed: {str(e)}"],
                        'file_path': None,
                        'metadata': None,
                        'chunks': [],
                        'display_name': filename,
                        'processing_info': None
                    }
                })
                errors += 1

        return {
            'total_files': len(files),
            'successful': successful,
            'duplicates': duplicates,
            'errors': errors,
            'results': results
        }

    def cleanup_temp_file(self, file_path: str):
        """Clean up temporary file"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Cleaned up temp file: {file_path}")
        except Exception as e:
            logger.error(f"Error cleaning up temp file {file_path}: {e}")