import os
import hashlib
import mimetypes
from pathlib import Path
from typing import Optional
import re


class FileUtils:

    @staticmethod
    def ensure_directory(path: str) -> None:
        """Ensure directory exists, create if it doesn't"""
        Path(path).mkdir(parents=True, exist_ok=True)

    @staticmethod
    def get_file_size(file_path: str) -> int:
        """Get file size in bytes"""
        return os.path.getsize(file_path)

    @staticmethod
    def get_file_hash(file_path: str) -> str:
        """Generate MD5 hash of file"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    @staticmethod
    def is_pdf(file_path: str) -> bool:
        """Check if file is a PDF"""
        mime_type, _ = mimetypes.guess_type(file_path)
        return mime_type == 'application/pdf'

    @staticmethod
    def get_safe_filename(filename: str) -> str:
        """Generate safe filename by removing/replacing unsafe characters"""
        # Remove or replace unsafe characters
        safe_filename = re.sub(r'[<>:"/\\|?*]', '_', filename)

        # Remove multiple underscores
        safe_filename = re.sub(r'_+', '_', safe_filename)

        # Ensure it doesn't start or end with dots or spaces
        safe_filename = safe_filename.strip('. ')

        # Ensure it's not empty
        if not safe_filename:
            safe_filename = "unnamed_file.pdf"

        return safe_filename

    @staticmethod
    def format_file_size(size_bytes: int) -> str:
        """Format file size in human readable format"""
        if size_bytes == 0:
            return "0 B"

        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while size_bytes >= 1024 and i < len(size_names) - 1:
            size_bytes /= 1024.0
            i += 1

        return f"{size_bytes:.1f} {size_names[i]}"

    @staticmethod
    def clean_text(text: str) -> str:
        """Clean and normalize text"""
        if not text:
            return ""

        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text)

        # Remove control characters
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x84\x86-\x9f]', '', text)

        return text.strip()