import os
import logging
import hashlib
import subprocess
import tempfile
from pathlib import Path
import mimetypes
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime
import re
import shutil

import pytesseract

logger = logging.getLogger(__name__)

pytesseract.pytesseract.tesseract_cmd = 'C:/Program Files/Tesseract-OCR/tesseract.exe'

class DocumentProcessor:
    """Universal document processor supporting multiple file types including Excel"""

    def __init__(self):
        self.supported_types = {
            'pdf': self._process_pdf,
            'docx': self._process_docx,
            'doc': self._process_doc,
            'txt': self._process_txt,
            'md': self._process_markdown,
            'rtf': self._process_rtf,
            'csv': self._process_csv,
            'xlsx': self._process_xlsx,  # Added Excel support
            'xls': self._process_xls,   # Added legacy Excel support
            'json': self._process_json,
            'xml': self._process_xml,
            'html': self._process_html,
            'htm': self._process_html,  # Added htm extension
            'pptx': self._process_pptx, # Added PowerPoint support
            'ppt': self._process_ppt,   # Added legacy PowerPoint support
            'jpg': self._process_image,
            'jpeg': self._process_image,
            'png': self._process_image,
            'bmp': self._process_image,
            'tiff': self._process_image,
            'tif': self._process_image,  # Added tif extension
            'gif': self._process_image,
            'webp': self._process_image  # Added webp support
        }

        # Generic filenames that should be renamed based on content
        self.generic_filenames = {
            '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
            'document', 'file', 'untitled', 'new', 'temp', 'test',
            'doc', 'pdf', 'image', 'text', 'data', 'report',
            'copy', 'duplicate', 'unnamed', 'blank', 'sheet1',
            'workbook', 'book1', 'presentation', 'slide1'
        }

    def get_file_type(self, file_path: str) -> str:
        """Determine file type from file path"""
        return file_path.lower().split('.')[-1]

    def get_original_filename(self, file_path: str) -> str:
        """Extract original filename without extension"""
        return os.path.splitext(os.path.basename(file_path))[0]

    def is_generic_filename(self, filename: str) -> bool:
        """Check if filename is generic and should be renamed"""
        # Extract just the base name without extension
        base_name = os.path.splitext(os.path.basename(filename))[0].lower().strip()

        # Remove timestamp prefixes that might be added during upload
        original_base_name = re.sub(r'^\d{8}_\d{6}_', '', base_name)

        # If after removing timestamp, we have a meaningful name, it's not generic
        if len(original_base_name) > 2 and original_base_name not in self.generic_filenames:
            # Check if it's not just numbers
            if not original_base_name.isdigit():
                logger.debug(f"Filename '{original_base_name}' is considered valid (not generic)")
                return False

        # Check if it's in our generic list or is very short
        if original_base_name in self.generic_filenames or len(original_base_name) <= 2:
            logger.debug(f"Filename '{original_base_name}' is considered generic")
            return True

        # Check if it's just numbers
        if original_base_name.isdigit():
            logger.debug(f"Filename '{original_base_name}' is just numbers, considered generic")
            return True

        # Check for common generic patterns
        generic_patterns = [
            r'^untitled\d*$',
            r'^document\d*$',
            r'^file\d*$',
            r'^new\s*document\d*$',
            r'^scan\d*$',
            r'^img\d*$',
            r'^image\d*$',
            r'^sheet\d*$',
            r'^workbook\d*$',
            r'^book\d*$',
            r'^presentation\d*$'
        ]

        for pattern in generic_patterns:
            if re.match(pattern, original_base_name, re.IGNORECASE):
                logger.debug(f"Filename '{original_base_name}' matches generic pattern, considered generic")
                return True

        # If we get here, the filename appears to be meaningful
        logger.debug(f"Filename '{original_base_name}' is considered valid (not generic)")
        return False

    def is_supported(self, file_path: str) -> bool:
        """Check if file type is supported"""
        file_type = self.get_file_type(file_path)
        return file_type in self.supported_types

    def check_duplicate_by_hash(self, file_path: str, existing_files: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Check if file is duplicate based on hash"""
        try:
            current_hash = self.calculate_file_hash(file_path)
            if not current_hash:
                return None

            for existing_file in existing_files:
                if existing_file.get('file_hash') == current_hash:
                    return existing_file

        except Exception as e:
            logger.warning(f"Error checking for duplicates: {e}")

        return None

    def can_convert_to_pdf(self, file_type: str) -> bool:
        """Check if file type can be converted to PDF"""
        convertible_types = ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'txt', 'rtf']
        return file_type.lower() in convertible_types

    def convert_to_pdf_for_viewing(self, file_path: str, output_dir: str = None) -> str:
        """Convert document to PDF for viewing purposes only"""
        try:
            file_type = self.get_file_type(file_path)

            if not self.can_convert_to_pdf(file_type):
                raise ValueError(f"Cannot convert {file_type} to PDF")

            # Create output directory if not specified
            if output_dir is None:
                output_dir = os.path.join(os.path.dirname(file_path), 'temp_pdfs')

            os.makedirs(output_dir, exist_ok=True)

            # Generate PDF filename
            base_name = os.path.splitext(os.path.basename(file_path))[0]
            pdf_filename = f"{base_name}_view.pdf"
            pdf_path = os.path.join(output_dir, pdf_filename)

            # Check if PDF already exists and is newer than source
            if os.path.exists(pdf_path):
                source_mtime = os.path.getmtime(file_path)
                pdf_mtime = os.path.getmtime(pdf_path)
                if pdf_mtime > source_mtime:
                    logger.info(f"Using existing PDF: {pdf_path}")
                    return pdf_path

            logger.info(f"Converting {file_type} to PDF: {file_path} -> {pdf_path}")

            if file_type.lower() in ['docx', 'doc']:
                success = self._convert_word_to_pdf(file_path, pdf_path)
            elif file_type.lower() in ['xlsx', 'xls']:
                success = self._convert_excel_to_pdf(file_path, pdf_path)
            elif file_type.lower() in ['pptx', 'ppt']:
                success = self._convert_powerpoint_to_pdf(file_path, pdf_path)
            elif file_type.lower() == 'txt':
                success = self._convert_text_to_pdf(file_path, pdf_path)
            else:
                raise ValueError(f"No converter available for {file_type}")

            if success and os.path.exists(pdf_path):
                logger.info(f"Successfully converted to PDF: {pdf_path}")
                return pdf_path
            else:
                raise Exception("PDF conversion failed")

        except Exception as e:
            logger.error(f"Error converting {file_path} to PDF: {e}")
            raise

    def _convert_word_to_pdf(self, input_path: str, output_path: str) -> bool:
        """Convert Word document to PDF"""
        try:
            # Method 1: Try using docx2pdf (works on Windows with Word installed)
            try:
                from docx2pdf import convert
                convert(input_path, output_path)
                return os.path.exists(output_path)
            except ImportError:
                logger.warning("docx2pdf not available, trying alternative method")
            except Exception as e:
                logger.warning(f"docx2pdf failed: {e}, trying alternative method")

            # Method 2: Try using LibreOffice (cross-platform)
            try:
                result = subprocess.run([
                    'libreoffice', '--headless', '--convert-to', 'pdf',
                    '--outdir', os.path.dirname(output_path), input_path
                ], capture_output=True, text=True, timeout=60)

                if result.returncode == 0:
                    # LibreOffice creates PDF with same name as input
                    base_name = os.path.splitext(os.path.basename(input_path))[0]
                    libreoffice_pdf = os.path.join(os.path.dirname(output_path), f"{base_name}.pdf")

                    if os.path.exists(libreoffice_pdf):
                        if libreoffice_pdf != output_path:
                            os.rename(libreoffice_pdf, output_path)
                        return True

            except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                logger.warning(f"LibreOffice conversion failed: {e}")

            # Method 3: Create PDF from extracted text (fallback)
            return self._create_pdf_from_text(input_path, output_path)

        except Exception as e:
            logger.error(f"Word to PDF conversion failed: {e}")
            return False

    def _convert_excel_to_pdf(self, input_path: str, output_path: str) -> bool:
        """Convert Excel document to PDF"""
        try:
            # Try LibreOffice first
            try:
                result = subprocess.run([
                    'libreoffice', '--headless', '--convert-to', 'pdf',
                    '--outdir', os.path.dirname(output_path), input_path
                ], capture_output=True, text=True, timeout=60)

                if result.returncode == 0:
                    base_name = os.path.splitext(os.path.basename(input_path))[0]
                    libreoffice_pdf = os.path.join(os.path.dirname(output_path), f"{base_name}.pdf")

                    if os.path.exists(libreoffice_pdf):
                        if libreoffice_pdf != output_path:
                            os.rename(libreoffice_pdf, output_path)
                        return True

            except (subprocess.TimeoutExpired, FileNotFoundError):
                logger.warning("LibreOffice not available for Excel conversion")

            # Fallback: Create PDF from extracted text
            return self._create_pdf_from_text(input_path, output_path)

        except Exception as e:
            logger.error(f"Excel to PDF conversion failed: {e}")
            return False

    def _convert_powerpoint_to_pdf(self, input_path: str, output_path: str) -> bool:
        """Convert PowerPoint document to PDF"""
        try:
            # Try LibreOffice first
            try:
                result = subprocess.run([
                    'libreoffice', '--headless', '--convert-to', 'pdf',
                    '--outdir', os.path.dirname(output_path), input_path
                ], capture_output=True, text=True, timeout=60)

                if result.returncode == 0:
                    base_name = os.path.splitext(os.path.basename(input_path))[0]
                    libreoffice_pdf = os.path.join(os.path.dirname(output_path), f"{base_name}.pdf")

                    if os.path.exists(libreoffice_pdf):
                        if libreoffice_pdf != output_path:
                            os.rename(libreoffice_pdf, output_path)
                        return True

            except (subprocess.TimeoutExpired, FileNotFoundError):
                logger.warning("LibreOffice not available for PowerPoint conversion")

            # Fallback: Create PDF from extracted text
            return self._create_pdf_from_text(input_path, output_path)

        except Exception as e:
            logger.error(f"PowerPoint to PDF conversion failed: {e}")
            return False

    def _convert_text_to_pdf(self, input_path: str, output_path: str) -> bool:
        """Convert text file to PDF"""
        return self._create_pdf_from_text(input_path, output_path)

    def _create_pdf_from_text(self, input_path: str, output_path: str) -> bool:
        """Create PDF from text content using reportlab"""
        try:
            from reportlab.lib.pagesizes import letter, A4
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch

            # Extract text from the document
            file_type = self.get_file_type(input_path)
            processor = self.supported_types.get(file_type)

            if not processor:
                raise ValueError(f"No processor for {file_type}")

            text, metadata = processor(input_path)

            if not text:
                raise ValueError("No text content to convert")

            # Create PDF
            doc = SimpleDocTemplate(output_path, pagesize=A4)
            styles = getSampleStyleSheet()

            # Custom style for body text
            body_style = ParagraphStyle(
                'CustomBody',
                parent=styles['Normal'],
                fontSize=10,
                spaceAfter=12,
                leftIndent=0.5 * inch,
                rightIndent=0.5 * inch
            )

            story = []

            # Add title
            title = metadata.get('title') or os.path.splitext(os.path.basename(input_path))[0]
            story.append(Paragraph(title, styles['Title']))
            story.append(Spacer(1, 12))

            # Add metadata if available
            if metadata.get('author'):
                story.append(Paragraph(f"Author: {metadata['author']}", styles['Normal']))
            if metadata.get('subject'):
                story.append(Paragraph(f"Subject: {metadata['subject']}", styles['Normal']))

            story.append(Spacer(1, 20))

            # Add content
            paragraphs = text.split('\n\n')
            for para in paragraphs:
                if para.strip():
                    # Escape HTML characters and handle line breaks
                    para = para.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    para = para.replace('\n', '<br/>')
                    story.append(Paragraph(para, body_style))
                    story.append(Spacer(1, 6))

                doc.build(story)
                return os.path.exists(output_path)

        except ImportError:
            logger.error("reportlab not installed. Install with: pip install reportlab")
            return False
        except Exception as e:
            logger.error(f"Text to PDF conversion failed: {e}")
            return False

    def process_document(
            self,
            file_path: str,
            chunk_size: int = 1000,
            chunk_overlap: int = 200,
            auto_rename_generic: bool = True,
            max_title_length: int = 50,
            existing_files: Optional[List[Dict[str, Any]]] = None,
            original_filename: Optional[str] = None,
            check_duplicates: bool = True
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Process any supported document type with enhanced filename handling"""

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        file_type = self.get_file_type(file_path)

        if not self.is_supported(file_path):
            raise ValueError(f"Unsupported file type: {file_type}")

        try:
            logger.info(f"Processing {file_type.upper()} document: {file_path}")

            # Extract original filename info - use parameter if provided, otherwise extract from path
            original_filename = original_filename or os.path.basename(file_path)
            original_name_only = self.get_original_filename(original_filename)

            # Check for duplicates if enabled and existing files provided
            duplicate_info = None
            if check_duplicates and existing_files:
                duplicate_info = self.check_duplicate_by_hash(file_path, existing_files)

            # Get processor function
            processor = self.supported_types[file_type]

            # Extract text and metadata
            text, metadata = processor(file_path)

            if not text or not text.strip():
                raise ValueError("No text content extracted from document")

            # Determine if we need to rename the file
            should_rename = False
            rename_reason = ""

            # Only rename if filename is actually generic AND auto_rename is enabled
            if auto_rename_generic:
                is_generic = self.is_generic_filename(original_filename)
                if is_generic:
                    should_rename = True
                    rename_reason = "generic_filename"
                    logger.info(f"Generic filename detected, will rename: {original_filename}")
                else:
                    logger.info(f"Valid filename detected, keeping original: {original_filename}")
            else:
                logger.info(f"Auto-rename disabled, keeping original filename: {original_filename}")

            # Rename file if needed
            new_file_path = file_path
            if should_rename:
                new_file_path = self.rename_file_by_content(
                    file_path, text, metadata, max_title_length, rename_reason
                )
                logger.info(f"File renamed from: {original_filename} to: {os.path.basename(new_file_path)}")
            else:
                logger.info(f"File kept with original name: {original_filename}")

            # Create chunks
            chunks = self.create_chunks(text, chunk_size, chunk_overlap)

            # Enhanced processing metadata
            processing_metadata = {
                "original_filename": original_filename,
                "original_name_only": original_name_only,
                "final_filename": os.path.basename(new_file_path),
                "final_name_only": self.get_original_filename(new_file_path),
                "file_path": new_file_path,  # This is the key - return the new file path
                "file_type": file_type,
                "file_size": os.path.getsize(new_file_path),
                "file_hash": self.calculate_file_hash(new_file_path),
                "processing_date": datetime.utcnow().isoformat(),
                "chunk_count": len(chunks),
                "total_characters": len(text),
                "word_count": len(text.split()),
                "keywords": self.extract_keywords_simple(text),
                "was_renamed": new_file_path != file_path,
                "rename_reason": rename_reason if should_rename else None,
                "is_duplicate": duplicate_info is not None,
                "duplicate_of": duplicate_info.get('id') if duplicate_info else None,
                "extracted_title": self.extract_title_from_content(text, metadata, file_type),
                "filename_was_generic": should_rename,
                "duplicate_check_enabled": check_duplicates
            }

            # Merge with file-specific metadata
            final_metadata = {**metadata, **processing_metadata}

            logger.info(f"Successfully processed {file_type.upper()}: {len(chunks)} chunks created")

            if processing_metadata["was_renamed"]:
                logger.info(f"File renamed: {original_filename} → {processing_metadata['final_filename']}")
            else:
                logger.info(f"File kept original name: {original_filename}")

            return chunks, final_metadata

        except Exception as e:
            logger.error(f"Error processing {file_type} document {file_path}: {e}")
            raise

    def rename_file_by_content(
            self,
            file_path: str,
            text: str,
            metadata: Dict[str, Any],
            max_length: int = 50,
            reason: str = "generic_filename"
    ) -> str:
        """Rename file based on document title or content"""
        try:
            file_type = self.get_file_type(file_path)
            file_dir = os.path.dirname(file_path)
            file_ext = os.path.splitext(file_path)[1]

            # Extract title based on file type
            title = self.extract_title_from_content(text, metadata, file_type)

            if not title:
                logger.info(f"No suitable title found for {file_path}, keeping original name")
                return file_path

            # Generate safe filename
            safe_filename = self.generate_safe_filename(title, max_length)
            new_filename = f"{safe_filename}{file_ext}"
            new_file_path = os.path.join(file_dir, new_filename)

            # Handle duplicate filenames
            new_file_path = self.handle_duplicate_filename(new_file_path)

            # Rename the file
            if new_file_path != file_path:
                shutil.move(file_path, new_file_path)
                logger.info(
                    f"Renamed file ({reason}): {os.path.basename(file_path)} → {os.path.basename(new_file_path)}")
                return new_file_path
            else:
                return file_path

        except Exception as e:
            logger.error(f"Error renaming file {file_path}: {e}")
            return file_path  # Return original path if renaming fails

    def extract_title_from_content(
            self,
            text: str,
            metadata: Dict[str, Any],
            file_type: str
    ) -> Optional[str]:
        """Extract title from document content based on file type"""

        if file_type == 'pdf':
            # Try metadata title first
            if metadata.get('title') and metadata['title'].strip():
                return metadata['title'].strip()
            # Fall back to first line of text
            return self.get_first_meaningful_line(text)

        elif file_type == 'docx':
            # Try document title property first
            if metadata.get('title') and metadata['title'].strip():
                return metadata['title'].strip()
            # Fall back to first paragraph
            return self.get_first_meaningful_line(text)

        elif file_type in ['doc', 'rtf']:
            # Use first meaningful line
            return self.get_first_meaningful_line(text)

        elif file_type == 'txt':
            # Use first line
            return self.get_first_meaningful_line(text)

        elif file_type == 'md':
            # Look for first header or title in front matter
            if 'title' in metadata and metadata['title']:
                return str(metadata['title']).strip()

            # Look for first markdown header
            header_match = re.search(r'^#+\s+(.+)', text, re.MULTILINE)
            if header_match:
                return header_match.group(1).strip()

            # Fall back to first line
            return self.get_first_meaningful_line(text)

        elif file_type == 'csv':
            # Use filename or create descriptive name from headers
            if metadata.get('headers'):
                headers = metadata['headers'][:3]  # First 3 headers
                return f"Data_{' '.join(headers)}"
            return None

        elif file_type in ['xlsx', 'xls']:
            # Try workbook title or sheet names
            if metadata.get('title') and metadata['title'].strip():
                return metadata['title'].strip()

            # Use sheet names if available
            if metadata.get('sheet_names'):
                sheet_names = metadata['sheet_names']
                if len(sheet_names) == 1 and sheet_names[0] != 'Sheet1':
                    return f"Excel_{sheet_names[0]}"
                elif len(sheet_names) > 1:
                    return f"Excel_Workbook_{len(sheet_names)}_Sheets"

            # Fall back to first meaningful line from content
            return self.get_first_meaningful_line(text, max_words=6)

        elif file_type in ['pptx', 'ppt']:
            # Try presentation title
            if metadata.get('title') and metadata['title'].strip():
                return metadata['title'].strip()

            # Use first slide title if available
            if metadata.get('slide_titles') and metadata['slide_titles']:
                return metadata['slide_titles'][0]

            # Fall back to first meaningful line
            return self.get_first_meaningful_line(text)

        elif file_type == 'json':
            # Look for common title fields
            title_fields = ['title', 'name', 'filename', 'document_title']
            for field in title_fields:
                if field in metadata.get('structure', {}).get('keys', []):
                    # Extract from first few lines of text
                    lines = text.split('\n')[:10]
                    for line in lines:
                        if f"{field}:" in line:
                            title = line.split(':', 1)[1].strip()
                            if title:
                                return title
            return None

        elif file_type == 'xml':
            # Use root element name or first text content
            root_tag = metadata.get('root_tag', '').replace('{', '').replace('}', '')
            if root_tag:
                return f"{root_tag}_Document"
            return self.get_first_meaningful_line(text)

        elif file_type in ['html', 'htm']:
            # Use title tag first
            if metadata.get('title') and metadata['title'].strip():
                return metadata['title'].strip()

            # Look for first heading
            headings = metadata.get('headings', [])
            if headings:
                return headings[0].get('text', '').strip()

            # Fall back to first line
            return self.get_first_meaningful_line(text)

        elif file_type in ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'gif', 'webp']:
            # Use first few words from OCR text
            return self.get_first_meaningful_line(text, max_words=8)

        return None

    def get_first_meaningful_line(self, text: str, max_words: int = 12) -> Optional[str]:
        """Extract first meaningful line from text"""
        if not text or not text.strip():
            return None

        lines = text.strip().split('\n')

        for line in lines:
            line = line.strip()

            # Skip empty lines, page markers, and very short lines
            if (len(line) < 3 or
                    line.startswith('[Page ') or
                    line.startswith('Page ') or
                    re.match(r'^\d+$', line) or  # Skip page numbers
                    len(line.split()) < 2):  # Skip single words
                continue

            # Clean up the line
            line = re.sub(r'\s+', ' ', line)  # Normalize whitespace
            line = re.sub(r'[^\w\s\-\.\,\!\?]', ' ', line)  # Remove special chars

            # Limit to max_words
            words = line.split()[:max_words]
            result = ' '.join(words)

            if len(result) >= 5:  # Minimum length
                return result

        return None

    def generate_safe_filename(self, title: str, max_length: int = 50) -> str:
        """Generate a safe filename from title"""
        if not title:
            return "untitled"

        # Remove or replace problematic characters
        # Keep only alphanumeric, spaces, hyphens, underscores, and periods
        safe_title = re.sub(r'[<>:"/\\|?*]', '', title)  # Remove illegal chars
        safe_title = re.sub(r'[^\w\s\-\.]', ' ', safe_title)  # Replace other special chars
        safe_title = re.sub(r'\s+', ' ', safe_title)  # Normalize spaces
        safe_title = safe_title.strip()

        # Replace spaces with underscores or hyphens
        safe_title = safe_title.replace(' ', '_')

        # Truncate to max length
        if len(safe_title) > max_length:
            safe_title = safe_title[:max_length].rstrip('_')

        # Ensure it's not empty
        if not safe_title:
            safe_title = "untitled"

        return safe_title

    def handle_duplicate_filename(self, file_path: str) -> str:
        """Handle duplicate filenames by adding a counter"""
        if not os.path.exists(file_path):
            return file_path

        base_path = os.path.splitext(file_path)[0]
        extension = os.path.splitext(file_path)[1]
        counter = 1

        while os.path.exists(file_path):
            file_path = f"{base_path}_{counter}{extension}"
            counter += 1

        return file_path

    def clean_filename_for_storage(self, filename: str) -> str:
        """Clean filename for database storage (remove date prefixes)"""
        # Remove common date prefixes that might be added by the system
        clean_name = re.sub(r'^\d{4}[-_]\d{2}[-_]\d{2}[-_]?', '', filename)
        clean_name = re.sub(r'^\d{8}[-_]?', '', clean_name)
        clean_name = re.sub(r'^\d{2}[-_]\d{2}[-_]\d{4}[-_]?', '', clean_name)
        clean_name = re.sub(r'^\d{10,}[-_]?', '', clean_name)  # Remove timestamps

        return clean_name.strip('_-') or filename

    def get_display_filename(self, file_path: str, metadata: Dict[str, Any]) -> str:
        """Get clean filename for display purposes"""
        try:
            # Use the final filename from metadata if available
            if metadata.get('final_filename'):
                return self.clean_filename_for_storage(metadata['final_filename'])

            # Use original filename if available
            if metadata.get('original_filename'):
                return self.clean_filename_for_storage(metadata['original_filename'])

            # Fall back to extracting from file path
            return self.clean_filename_for_storage(os.path.basename(file_path))

        except Exception as e:
            logger.error(f"Error getting display filename: {e}")
            return os.path.basename(file_path)

    def _process_pdf(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Process PDF files"""
        try:
            import PyPDF2

            text = ""
            metadata = {}

            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)

                # Extract metadata
                if pdf_reader.metadata:
                    metadata.update({
                        "title": pdf_reader.metadata.get('/Title', ''),
                        "author": pdf_reader.metadata.get('/Author', ''),
                        "subject": pdf_reader.metadata.get('/Subject', ''),
                        "creator": pdf_reader.metadata.get('/Creator', ''),
                        "producer": pdf_reader.metadata.get('/Producer', ''),
                        "creation_date": str(pdf_reader.metadata.get('/CreationDate', '')),
                        "modification_date": str(pdf_reader.metadata.get('/ModDate', ''))
                    })

                metadata["total_pages"] = len(pdf_reader.pages)

                # Extract text from all pages
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text += f"\n[Page {page_num + 1}]\n{page_text}\n"
                    except Exception as e:
                        logger.warning(f"Could not extract text from page {page_num + 1}: {e}")

            return text.strip(), metadata

        except ImportError:
            raise ImportError("PyPDF2 is required for PDF processing. Install with: pip install PyPDF2")
        except Exception as e:
            logger.error(f"Error processing PDF: {e}")
            raise

    def _process_docx(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Process DOCX files"""
        try:
            from docx import Document

            doc = Document(file_path)

            # Extract text
            text = ""
            paragraph_count = 0

            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    text += paragraph.text + "\n"
                    paragraph_count += 1

            # Extract metadata
            metadata = {
                "title": doc.core_properties.title or "",
                "author": doc.core_properties.author or "",
                "subject": doc.core_properties.subject or "",
                "created": str(doc.core_properties.created) if doc.core_properties.created else "",
                "modified": str(doc.core_properties.modified) if doc.core_properties.modified else "",
                "paragraph_count": paragraph_count
            }

            return text.strip(), metadata

        except ImportError:
            raise ImportError("python-docx is required for DOCX processing. Install with: pip install python-docx")
        except Exception as e:
            logger.error(f"Error processing DOCX: {e}")
            raise

    def _process_doc(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Process DOC files (legacy Word format)"""
        try:
            import textract

            # Extract text using textract
            text = textract.process(file_path).decode('utf-8')

            metadata = {
                "format": "doc",
                "extracted_with": "textract"
            }

            return text.strip(), metadata

        except ImportError:
            raise ImportError("textract is required for DOC processing. Install with: pip install textract")
        except Exception as e:
            logger.error(f"Error processing DOC: {e}")
            raise

    def _process_xlsx(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Process XLSX files (Excel 2007+)"""
        try:
            import openpyxl
            from openpyxl.utils import get_column_letter

            workbook = openpyxl.load_workbook(file_path, data_only=True)

            text_parts = []
            metadata = {
                "format": "xlsx",
                "sheet_names": workbook.sheetnames,
                "sheet_count": len(workbook.sheetnames),
                "total_rows": 0,
                "total_cells_with_data": 0
            }

            # Extract workbook properties if available
            if hasattr(workbook, 'properties') and workbook.properties:
                props = workbook.properties
                metadata.update({
                    "title": getattr(props, 'title', '') or '',
                    "author": getattr(props, 'creator', '') or '',
                    "subject": getattr(props, 'subject', '') or '',
                    "created": str(getattr(props, 'created', '')) if getattr(props, 'created', None) else '',
                    "modified": str(getattr(props, 'modified', '')) if getattr(props, 'modified', None) else ''
                })

            # Process each worksheet
            for sheet_name in workbook.sheetnames:
                try:
                    worksheet = workbook[sheet_name]

                    # Add sheet header
                    text_parts.append(f"\n=== Sheet: {sheet_name} ===\n")

                    # Get the used range
                    if worksheet.max_row == 1 and worksheet.max_column == 1:
                        # Empty sheet
                        text_parts.append("(Empty sheet)")
                        continue

                    # Extract data row by row
                    sheet_rows = 0
                    sheet_cells_with_data = 0

                    for row_num, row in enumerate(worksheet.iter_rows(values_only=True), 1):
                        # Skip completely empty rows
                        if not any(cell is not None and str(cell).strip() for cell in row):
                            continue

                        sheet_rows += 1
                        row_text = []

                        for col_num, cell_value in enumerate(row, 1):
                            if cell_value is not None and str(cell_value).strip():
                                col_letter = get_column_letter(col_num)

                                # Format cell value
                                if isinstance(cell_value, (int, float)):
                                    formatted_value = str(cell_value)
                                else:
                                    formatted_value = str(cell_value).strip()

                                if formatted_value:
                                    row_text.append(f"{col_letter}{row_num}: {formatted_value}")
                                    sheet_cells_with_data += 1

                        if row_text:
                            text_parts.append(" | ".join(row_text))

                        # Limit rows per sheet to prevent huge documents
                        if sheet_rows > 500:
                            text_parts.append(f"... (truncated at 500 rows for sheet '{sheet_name}')")
                            break

                    metadata["total_rows"] += sheet_rows
                    metadata["total_cells_with_data"] += sheet_cells_with_data

                except Exception as e:
                    logger.warning(f"Error processing sheet '{sheet_name}': {e}")
                    text_parts.append(f"Error processing sheet '{sheet_name}': {str(e)}")

            text = "\n".join(text_parts)

            # Add summary to metadata
            metadata[
                "processing_summary"] = f"Processed {len(workbook.sheetnames)} sheets with {metadata['total_rows']} total rows"

            return text, metadata

        except ImportError:
            raise ImportError("openpyxl is required for XLSX processing. Install with: pip install openpyxl")
        except Exception as e:
            logger.error(f"Error processing XLSX: {e}")
            raise

    def _process_xls(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Process XLS files (legacy Excel format)"""
        try:
            import xlrd

            workbook = xlrd.open_workbook(file_path)

            text_parts = []
            metadata = {
                "format": "xls",
                "sheet_names": workbook.sheet_names(),
                "sheet_count": workbook.nsheets,
                "total_rows": 0,
                "total_cells_with_data": 0
            }

            # Process each worksheet
            for sheet_name in workbook.sheet_names():
                try:
                    worksheet = workbook.sheet_by_name(sheet_name)

                    # Add sheet header
                    text_parts.append(f"\n=== Sheet: {sheet_name} ===\n")

                    if worksheet.nrows == 0:
                        text_parts.append("(Empty sheet)")
                        continue

                    # Extract data row by row
                    sheet_rows = 0
                    sheet_cells_with_data = 0

                    for row_num in range(worksheet.nrows):
                        row_values = worksheet.row_values(row_num)

                        # Skip completely empty rows
                        if not any(str(cell).strip() for cell in row_values if cell):
                            continue

                        sheet_rows += 1
                        row_text = []

                        for col_num, cell_value in enumerate(row_values):
                            if cell_value and str(cell_value).strip():
                                # Convert column number to letter
                                col_letter = chr(65 + col_num) if col_num < 26 else f"A{chr(65 + col_num - 26)}"

                                # Format cell value
                                if isinstance(cell_value, (int, float)):
                                    formatted_value = str(cell_value)
                                else:
                                    formatted_value = str(cell_value).strip()

                                if formatted_value:
                                    row_text.append(f"{col_letter}{row_num + 1}: {formatted_value}")
                                    sheet_cells_with_data += 1

                        if row_text:
                            text_parts.append(" | ".join(row_text))

                        # Limit rows per sheet to prevent huge documents
                        if sheet_rows > 500:
                            text_parts.append(f"... (truncated at 500 rows for sheet '{sheet_name}')")
                            break

                    metadata["total_rows"] += sheet_rows
                    metadata["total_cells_with_data"] += sheet_cells_with_data

                except Exception as e:
                    logger.warning(f"Error processing sheet '{sheet_name}': {e}")
                    text_parts.append(f"Error processing sheet '{sheet_name}': {str(e)}")

            text = "\n".join(text_parts)

            # Add summary to metadata
            metadata[
                "processing_summary"] = f"Processed {workbook.nsheets} sheets with {metadata['total_rows']} total rows"

            return text, metadata

        except ImportError:
            raise ImportError("xlrd is required for XLS processing. Install with: pip install xlrd")
        except Exception as e:
            logger.error(f"Error processing XLS: {e}")
            raise

    def _process_pptx(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Process PPTX files (PowerPoint 2007+)"""
        try:
            from pptx import Presentation

            presentation = Presentation(file_path)

            text_parts = []
            slide_titles = []
            metadata = {
                "format": "pptx",
                "slide_count": len(presentation.slides),
                "total_shapes": 0,
                "total_text_shapes": 0
            }

            # Extract presentation properties if available
            if hasattr(presentation, 'core_properties') and presentation.core_properties:
                props = presentation.core_properties
                metadata.update({
                    "title": getattr(props, 'title', '') or '',
                    "author": getattr(props, 'author', '') or '',
                    "subject": getattr(props, 'subject', '') or '',
                    "created": str(getattr(props, 'created', '')) if getattr(props, 'created', None) else '',
                    "modified": str(getattr(props, 'modified', '')) if getattr(props, 'modified', None) else ''
                })

            # Process each slide
            for slide_num, slide in enumerate(presentation.slides, 1):
                try:
                    text_parts.append(f"\n=== Slide {slide_num} ===\n")

                    slide_text = []
                    slide_title = None

                    # Extract text from all shapes
                    for shape in slide.shapes:
                        metadata["total_shapes"] += 1

                        if hasattr(shape, "text") and shape.text.strip():
                            metadata["total_text_shapes"] += 1
                            shape_text = shape.text.strip()

                            # First text shape is often the title
                            if slide_title is None and len(shape_text) < 100:
                                slide_title = shape_text
                                slide_titles.append(shape_text)

                            slide_text.append(shape_text)

                    if slide_text:
                        text_parts.extend(slide_text)
                    else:
                        text_parts.append("(No text content)")

                except Exception as e:
                    logger.warning(f"Error processing slide {slide_num}: {e}")
                    text_parts.append(f"Error processing slide {slide_num}: {str(e)}")

            text = "\n".join(text_parts)
            metadata["slide_titles"] = slide_titles
            metadata[
                "processing_summary"] = f"Processed {len(presentation.slides)} slides with {metadata['total_text_shapes']} text shapes"

            return text, metadata

        except ImportError:
            raise ImportError("python-pptx is required for PPTX processing. Install with: pip install python-pptx")
        except Exception as e:
            logger.error(f"Error processing PPTX: {e}")
            raise

    def _process_ppt(self, file_path: str) -> Tuple[str, Dict[str, Any]]:
        """Process PPT files (legacy PowerPoint format)"""
        try:
            # Try using textract for legacy PPT files
            import textract

            text = textract.process(file_path).decode('utf-8')

            metadata = {
                "format": "ppt",
                "extracted_with": "textract",
                "processing_summary": "Processed legacy PowerPoint file using textract"
            }

            return text.strip(), metadata


        except ImportError:

            raise ImportError("textract is required for PPT processing. Install with: pip install textract")

        except Exception as e:

            logger.error(f"Error processing PPT: {e}")

            raise

    def _process_txt(self, file_path: str) -> Tuple[str, Dict[str, Any]]:

        """Process plain text files"""

        try:

            # Try different encodings

            encodings = ['utf-8', 'utf-16', 'latin-1', 'cp1252']

            for encoding in encodings:

                try:

                    with open(file_path, 'r', encoding=encoding) as file:

                        text = file.read()

                    break

                except UnicodeDecodeError:

                    continue

            else:

                raise ValueError("Could not decode text file with any supported encoding")

            metadata = {

                "format": "txt",

                "encoding": encoding,

                "line_count": len(text.splitlines()),

                "processing_summary": f"Processed text file with {encoding} encoding"

            }

            return text, metadata


        except Exception as e:

            logger.error(f"Error processing TXT: {e}")

            raise

    def _process_markdown(self, file_path: str) -> Tuple[str, Dict[str, Any]]:

        """Process Markdown files"""

        try:

            with open(file_path, 'r', encoding='utf-8') as file:

                text = file.read()

            # Extract markdown metadata (front matter)

            metadata = {"format": "markdown"}

            # Check for YAML front matter

            if text.startswith('---'):

                try:

                    import yaml

                    parts = text.split('---', 2)

                    if len(parts) >= 3:

                        front_matter = yaml.safe_load(parts[1])

                        if isinstance(front_matter, dict):
                            metadata.update(front_matter)

                        text = parts[2].strip()

                except ImportError:

                    logger.warning("PyYAML not available for front matter parsing")

                except Exception as e:

                    logger.warning(f"Could not parse front matter: {e}")

            # Count headers

            headers = re.findall(r'^#+\s+(.+)', text, re.MULTILINE)

            metadata["header_count"] = len(headers)

            metadata["headers"] = headers[:10]  # First 10 headers

            metadata["processing_summary"] = f"Processed Markdown file with {len(headers)} headers"

            return text, metadata


        except Exception as e:

            logger.error(f"Error processing Markdown: {e}")

            raise

    def _process_rtf(self, file_path: str) -> Tuple[str, Dict[str, Any]]:

        """Process RTF files"""

        try:

            from striprtf.striprtf import rtf_to_text

            with open(file_path, 'r', encoding='utf-8') as file:

                rtf_content = file.read()

            text = rtf_to_text(rtf_content)

            metadata = {

                "format": "rtf",

                "extracted_with": "striprtf",

                "processing_summary": "Processed RTF file using striprtf"

            }

            return text, metadata


        except ImportError:

            raise ImportError("striprtf is required for RTF processing. Install with: pip install striprtf")

        except Exception as e:

            logger.error(f"Error processing RTF: {e}")

            raise

    def _process_csv(self, file_path: str) -> Tuple[str, Dict[str, Any]]:

        """Process CSV files"""

        try:

            import csv

            text_parts = []

            row_count = 0

            headers = []

            with open(file_path, 'r', encoding='utf-8') as file:

                # Detect delimiter

                sample = file.read(1024)

                file.seek(0)

                sniffer = csv.Sniffer()

                delimiter = sniffer.sniff(sample).delimiter

                reader = csv.reader(file, delimiter=delimiter)

                for i, row in enumerate(reader):

                    if i == 0:

                        headers = row

                        text_parts.append("Headers: " + ", ".join(row))

                    else:

                        # Convert row to readable text

                        row_text = []

                        for j, cell in enumerate(row):

                            if j < len(headers):

                                row_text.append(f"{headers[j]}: {cell}")

                            else:

                                row_text.append(cell)

                        text_parts.append("Row " + str(i) + ": " + "; ".join(row_text))

                    row_count += 1

                    # Limit rows to prevent huge documents

                    if row_count > 1000:
                        text_parts.append(f"... (truncated at 1000 rows, total rows: {row_count})")

                        break

            text = "\n".join(text_parts)

            metadata = {

                "format": "csv",

                "delimiter": delimiter,

                "headers": headers,

                "row_count": row_count,

                "column_count": len(headers),

                "processing_summary": f"Processed CSV file with {row_count} rows and {len(headers)} columns"

            }

            return text, metadata


        except Exception as e:

            logger.error(f"Error processing CSV: {e}")

            raise

    def _process_json(self, file_path: str) -> Tuple[str, Dict[str, Any]]:

        """Process JSON files"""

        try:

            import json

            with open(file_path, 'r', encoding='utf-8') as file:

                data = json.load(file)

            # Convert JSON to readable text

            def json_to_text(obj, prefix=""):

                text_parts = []

                if isinstance(obj, dict):

                    for key, value in obj.items():

                        current_prefix = f"{prefix}.{key}" if prefix else key

                        if isinstance(value, (dict, list)):

                            text_parts.extend(json_to_text(value, current_prefix))

                        else:

                            text_parts.append(f"{current_prefix}: {value}")


                elif isinstance(obj, list):

                    for i, item in enumerate(obj):

                        current_prefix = f"{prefix}[{i}]" if prefix else f"item_{i}"

                        if isinstance(item, (dict, list)):

                            text_parts.extend(json_to_text(item, current_prefix))

                        else:

                            text_parts.append(f"{current_prefix}: {item}")

                return text_parts

            text_parts = json_to_text(data)

            text = "\n".join(text_parts)

            # Analyze JSON structure

            def analyze_structure(obj):

                if isinstance(obj, dict):

                    return {

                        "type": "object",

                        "keys": list(obj.keys())[:20],  # First 20 keys

                        "key_count": len(obj.keys())

                    }

                elif isinstance(obj, list):

                    return {

                        "type": "array",

                        "length": len(obj),

                        "item_types": list(set(type(item).__name__ for item in obj[:10]))

                    }

                else:

                    return {"type": type(obj).__name__}

            metadata = {

                "format": "json",

                "structure": analyze_structure(data),

                "file_size_bytes": os.path.getsize(file_path),

                "processing_summary": f"Processed JSON file with {len(text_parts)} data elements"

            }

            return text, metadata


        except Exception as e:

            logger.error(f"Error processing JSON: {e}")

            raise

    def _process_xml(self, file_path: str) -> Tuple[str, Dict[str, Any]]:

        """Process XML files"""

        try:

            import xml.etree.ElementTree as ET

            tree = ET.parse(file_path)

            root = tree.getroot()

            # Convert XML to readable text

            def xml_to_text(element, level=0):

                text_parts = []

                indent = "  " * level

                # Element name and attributes

                elem_text = f"{indent}{element.tag}"

                if element.attrib:
                    attrs = ", ".join(f"{k}={v}" for k, v in element.attrib.items())

                    elem_text += f" ({attrs})"

                # Element text content

                if element.text and element.text.strip():
                    elem_text += f": {element.text.strip()}"

                text_parts.append(elem_text)

                # Process children

                for child in element:
                    text_parts.extend(xml_to_text(child, level + 1))

                return text_parts

            text_parts = xml_to_text(root)

            text = "\n".join(text_parts)

            # Count elements

            def count_elements(element):

                count = 1

                for child in element:
                    count += count_elements(child)

                return count

            metadata = {

                "format": "xml",

                "root_tag": root.tag,

                "total_elements": count_elements(root),

                "root_attributes": dict(root.attrib) if root.attrib else {},

                "processing_summary": f"Processed XML file with {count_elements(root)} elements"

            }

            return text, metadata


        except Exception as e:

            logger.error(f"Error processing XML: {e}")

            raise

    def _process_html(self, file_path: str) -> Tuple[str, Dict[str, Any]]:

        """Process HTML files"""

        try:

            from bs4 import BeautifulSoup

            with open(file_path, 'r', encoding='utf-8') as file:

                html_content = file.read()

            soup = BeautifulSoup(html_content, 'html.parser')

            # Extract text content

            text = soup.get_text(separator='\n', strip=True)

            # Extract metadata

            metadata = {

                "format": "html",

                "title": soup.title.string if soup.title else "",

                "meta_description": "",

                "meta_keywords": "",

                "links_count": len(soup.find_all('a')),

                "images_count": len(soup.find_all('img')),

                "headings": []

            }

            # Extract meta tags

            meta_desc = soup.find('meta', attrs={'name': 'description'})

            if meta_desc:
                metadata["meta_description"] = meta_desc.get('content', '')

            meta_keywords = soup.find('meta', attrs={'name': 'keywords'})

            if meta_keywords:
                metadata["meta_keywords"] = meta_keywords.get('content', '')

            # Extract headings

            for i in range(1, 7):

                headings = soup.find_all(f'h{i}')

                for heading in headings[:5]:  # First 5 headings of each level

                    metadata["headings"].append({

                        "level": i,

                        "text": heading.get_text(strip=True)

                    })

            metadata[
                "processing_summary"] = f"Processed HTML file with {len(metadata['headings'])} headings and {metadata['links_count']} links"

            return text, metadata


        except ImportError:

            raise ImportError(

                "beautifulsoup4 is required for HTML processing. Install with: pip install beautifulsoup4")

        except Exception as e:

            logger.error(f"Error processing HTML: {e}")

            raise

    def _process_image(self, file_path: str) -> Tuple[str, Dict[str, Any]]:

        """Process image files using OCR"""

        try:

            from PIL import Image

            import pytesseract

            # Open image

            image = Image.open(file_path)

            # Perform OCR

            ocr_config = '--oem 3 --psm 6'  # OCR Engine Mode 3, Page Segmentation Mode 6

            # Get text with confidence scores

            ocr_data = pytesseract.image_to_data(image, config=ocr_config, output_type=pytesseract.Output.DICT)

            # Filter text by confidence

            min_confidence = 30  # Minimum confidence threshold

            text_parts = []

            confidences = []

            for i, conf in enumerate(ocr_data['conf']):

                if int(conf) > min_confidence:

                    text = ocr_data['text'][i].strip()

                    if text:
                        text_parts.append(text)

                        confidences.append(int(conf))

            extracted_text = ' '.join(text_parts)

            # Image metadata

            metadata = {

                "format": "image",

                "image_format": image.format,

                "size": image.size,

                "mode": image.mode,

                "ocr_confidence_avg": sum(confidences) / len(confidences) if confidences else 0,

                "ocr_confidence_min": min(confidences) if confidences else 0,

                "ocr_confidence_max": max(confidences) if confidences else 0,

                "ocr_words_detected": len(text_parts),

                "has_alpha": image.mode in ('RGBA', 'LA'),

                "dpi": image.info.get('dpi', (72, 72)),

                "processing_summary": f"Processed {image.format} image with OCR, extracted {len(text_parts)} words"

            }

            # Add EXIF data if available

            if hasattr(image, '_getexif') and image._getexif():

                try:

                    exif = image._getexif()

                    metadata["exif"] = {k: str(v) for k, v in exif.items() if isinstance(v, (str, int, float))}

                except:

                    pass

            return extracted_text, metadata


        except ImportError:

            raise ImportError(

                "PIL and pytesseract are required for image processing. Install with: pip install Pillow pytesseract")

        except Exception as e:

            logger.error(f"Error processing image: {e}")

            raise

    def create_chunks(

            self,

            text: str,

            chunk_size: int = 1000,

            chunk_overlap: int = 200

    ) -> List[Dict[str, Any]]:

        """Create text chunks with metadata"""

        if not text or not text.strip():
            return []

        # Split text into sentences for better chunking

        sentences = self.simple_sentence_split(text)

        chunks = []

        current_chunk = ""

        current_sentences = []

        chunk_index = 0

        for sentence in sentences:

            # Check if adding this sentence would exceed chunk size

            if len(current_chunk) + len(sentence) > chunk_size and current_chunk:

                # Create chunk

                chunk_data = {

                    "chunk_index": chunk_index,

                    "content": current_chunk.strip(),

                    "word_count": len(current_chunk.split()),

                    "char_count": len(current_chunk),

                    "sentence_count": len(current_sentences)

                }

                chunks.append(chunk_data)

                # Handle overlap

                if chunk_overlap > 0 and current_sentences:

                    # Keep last few sentences for overlap

                    overlap_text = ""

                    overlap_sentences = []

                    for sent in reversed(current_sentences):

                        if len(overlap_text) + len(sent) <= chunk_overlap:

                            overlap_text = sent + " " + overlap_text

                            overlap_sentences.insert(0, sent)

                        else:

                            break

                    current_chunk = overlap_text + sentence

                    current_sentences = overlap_sentences + [sentence]

                else:

                    current_chunk = sentence

                    current_sentences = [sentence]

                chunk_index += 1

            else:

                current_chunk += " " + sentence if current_chunk else sentence

                current_sentences.append(sentence)

            # Add final chunk

        if current_chunk.strip():
            chunk_data = {

                "chunk_index": chunk_index,

                "content": current_chunk.strip(),

                "word_count": len(current_chunk.split()),

                "char_count": len(current_chunk),

                "sentence_count": len(current_sentences)

            }

            chunks.append(chunk_data)

        return chunks

    def get_clean_filename(self, file_path: str) -> str:

        """Extract clean filename without date prefixes and extension"""

        filename = os.path.basename(file_path)

        name_only = os.path.splitext(filename)[0]

        # Remove date/timestamp prefixes that might have been added

        clean_name = re.sub(r'^\d{4}[-_]\d{2}[-_]\d{2}[-_]?', '', name_only)

        clean_name = re.sub(r'^\d{8}[-_]?', '', clean_name)

        clean_name = re.sub(r'^\d{2}[-_]\d{2}[-_]\d{4}[-_]?', '', clean_name)

        clean_name = re.sub(r'^\d{10,}[-_]?', '', clean_name)  # Remove timestamps

        clean_name = re.sub(r'^copy[-_]?of[-_]?', '', clean_name, flags=re.IGNORECASE)

        return clean_name.strip('_-') or name_only

    def check_duplicate_filename(self, file_path: str, existing_files: List[Dict[str, Any]]) -> Optional[

        Dict[str, Any]]:

        """Check if filename already exists (case-insensitive)"""

        current_filename = self.get_clean_filename(file_path).lower()

        for existing_file in existing_files:

            # Check multiple possible filename fields

            existing_names = [

                existing_file.get('filename', ''),

                existing_file.get('original_filename', ''),

                existing_file.get('display_filename', ''),

                existing_file.get('final_filename', '')

            ]

            for existing_name in existing_names:

                if existing_name:

                    clean_existing = self.get_clean_filename(existing_name).lower()

                    if current_filename == clean_existing:
                        return existing_file

        return None

    def get_display_name(self, metadata: Dict[str, Any]) -> str:

        """Get the best display name for the document"""

        try:

            # For files that weren't renamed (valid filenames), use original filename

            if not metadata.get('was_renamed', False) and metadata.get('original_filename'):

                display_name = os.path.splitext(metadata['original_filename'])[0]

            # For renamed files, use extracted title or final filename

            elif metadata.get('extracted_title'):

                display_name = metadata['extracted_title']

            elif metadata.get('final_name_only'):

                display_name = metadata['final_name_only']

            elif metadata.get('original_name_only'):

                display_name = metadata['original_name_only']

            else:

                display_name = 'Untitled Document'

            # Clean up display name

            display_name = display_name.strip()

            # Ensure it's not too long for display

            if len(display_name) > 60:
                display_name = display_name[:57] + "..."

            return display_name


        except Exception as e:

            logger.error(f"Error getting display name: {e}")

            return 'Untitled Document'

    def simple_sentence_split(self, text: str) -> List[str]:

        """Simple sentence splitting without NLTK"""

        # Split on sentence endings, but be careful with abbreviations

        sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)

        return [s.strip() for s in sentences if s.strip()]

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

                'would', 'write', 'years', 'young', 'also', 'each', 'which',

                'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',

                'than', 'too', 'very', 'can', 'will', 'just', 'don', 'should', 'now',

                'sheet', 'cell', 'row', 'column', 'slide', 'page', 'document'

            }

            # Filter out stop words

            keywords = [word for word in words if word not in stop_words]

            # Count frequency and return top keywords

            from collections import Counter

            word_freq = Counter(keywords)

            top_keywords = [word for word, count in word_freq.most_common(15)]

            return top_keywords


        except Exception as e:

            logger.warning(f"Simple keyword extraction failed: {e}")

            return []

    def calculate_file_hash(self, file_path: str) -> str:

        """Calculate SHA256 hash of file"""

        try:

            with open(file_path, 'rb') as f:

                file_content = f.read()

                return hashlib.sha256(file_content).hexdigest()

        except Exception as e:

            logger.error(f"Error calculating file hash: {e}")

            return None

    def get_supported_extensions(self) -> List[str]:

        """Get list of all supported file extensions"""

        return list(self.supported_types.keys())

    def get_file_info(self, file_path: str) -> Dict[str, Any]:

        """Get basic file information without processing"""

        try:

            stat = os.stat(file_path)

            file_type = self.get_file_type(file_path)

            return {

                "filename": os.path.basename(file_path),

                "file_type": file_type,

                "file_size": stat.st_size,

                "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),

                "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),

                "is_supported": self.is_supported(file_path),

                "can_convert_to_pdf": self.can_convert_to_pdf(file_type)

            }

        except Exception as e:

            logger.error(f"Error getting file info: {e}")

            return {}

    def validate_file_for_processing(self, file_path: str, max_size_mb: int = 100) -> Dict[str, Any]:

        """Validate file before processing"""

        validation_result = {

            "is_valid": False,

            "errors": [],

            "warnings": [],

            "file_info": {}

        }

        try:

            # Check if file exists

            if not os.path.exists(file_path):
                validation_result["errors"].append("File does not exist")

                return validation_result

            # Get file info

            file_info = self.get_file_info(file_path)

            validation_result["file_info"] = file_info

            # Check if file type is supported

            if not file_info.get("is_supported", False):
                validation_result["errors"].append(
                    f"File type '{file_info.get('file_type', 'unknown')}' is not supported")

            # Check file size

            file_size_mb = file_info.get("file_size", 0) / (1024 * 1024)

            if file_size_mb > max_size_mb:
                validation_result["errors"].append(
                    f"File size ({file_size_mb:.1f}MB) exceeds maximum allowed size ({max_size_mb}MB)")

            # Check if file is empty

            if file_info.get("file_size", 0) == 0:
                validation_result["errors"].append("File is empty")

            # Add warnings for large files

            if file_size_mb > 50:
                validation_result["warnings"].append(
                    f"Large file ({file_size_mb:.1f}MB) may take longer to process")

            # Check for Excel files with many sheets (potential warning)

            if file_info.get("file_type") in ['xlsx', 'xls']:
                validation_result["warnings"].append("Excel files with many sheets may take longer to process")

            # Set validation result

            validation_result["is_valid"] = len(validation_result["errors"]) == 0


        except Exception as e:

            validation_result["errors"].append(f"Validation error: {str(e)}")

        return validation_result

    def get_processing_stats(self) -> Dict[str, Any]:

        """Get statistics about supported file types and processing capabilities"""

        return {

            "supported_extensions": self.get_supported_extensions(),

            "total_supported_types": len(self.supported_types),

            "document_types": {

                "text_documents": ['pdf', 'docx', 'doc', 'txt', 'md', 'rtf'],

                "spreadsheets": ['xlsx', 'xls', 'csv'],

                "presentations": ['pptx', 'ppt'],

                "web_formats": ['html', 'htm', 'xml'],

                "data_formats": ['json', 'csv'],

                "images": ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'gif', 'webp']

            },

            "pdf_convertible": [ext for ext in self.supported_types.keys() if self.can_convert_to_pdf(ext)],

            "ocr_supported": ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'gif', 'webp']

        }

    def cleanup_temp_files(self, temp_dir: str = None):

        """Clean up temporary files created during processing"""

        try:

            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)

                logger.info(f"Cleaned up temporary directory: {temp_dir}")

        except Exception as e:

            logger.warning(f"Error cleaning up temp files: {e}")

    def batch_validate_files(self, file_paths: List[str], max_size_mb: int = 100) -> Dict[str, Any]:

        """Validate multiple files at once"""

        results = {

            "valid_files": [],

            "invalid_files": [],

            "total_size_mb": 0,

            "warnings": []

        }

        for file_path in file_paths:

            validation = self.validate_file_for_processing(file_path, max_size_mb)

            if validation["is_valid"]:

                results["valid_files"].append({

                    "path": file_path,

                    "info": validation["file_info"],

                    "warnings": validation["warnings"]

                })

            else:

                results["invalid_files"].append({

                    "path": file_path,

                    "errors": validation["errors"]

                })

            # Add to total size

            file_size_mb = validation["file_info"].get("file_size", 0) / (1024 * 1024)

            results["total_size_mb"] += file_size_mb

        # Add batch-level warnings

        if results["total_size_mb"] > 500:
            results["warnings"].append(f"Total batch size ({results['total_size_mb']:.1f}MB) is very large")

        if len(results["valid_files"]) > 50:
            results["warnings"].append(
                f"Processing {len(results['valid_files'])} files may take significant time")

        return results

# Example usage and testing functions

def test_excel_processing():

    """Test function for Excel file processing"""

    processor = DocumentProcessor()

    # Test if Excel extensions are supported

    excel_extensions = ['xlsx', 'xls']

    for ext in excel_extensions:
        print(f"Excel {ext.upper()} supported: {processor.is_supported(f'test.{ext}')}")

    # Print processing stats

    stats = processor.get_processing_stats()

    print(f"Spreadsheet formats supported: {stats['document_types']['spreadsheets']}")

    print(f"Total supported formats: {stats['total_supported_types']}")

if __name__ == "__main__":
    # Run test

    test_excel_processing()

