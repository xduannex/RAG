# RAG PDF Search - Frontend

A simple Node.js frontend for the RAG PDF Search API. This provides a clean chat interface to test and interact with your RAG backend capabilities.

## Features

- 📤 **PDF Upload**: Upload PDF documents with metadata
- 💬 **Chat Interface**: Ask questions about your documents
- 🔍 **Search Mode**: Search for specific content across documents
- 🧠 **RAG Mode**: Get AI-powered answers with source citations
- 📊 **Real-time Stats**: Monitor system status and usage
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and update the settings:
```bash
cp .env.example .env
```

Edit `.env`:
```env
RAG_API_URL=http://localhost:8000
PORT=3000
```

### 3. Start the Application
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### 4. Open in Browser
Navigate to `http://localhost:3000`

## Usage

### Upload Documents
1. Use the sidebar upload form
2. Select a PDF file
3. Optionally add title and category
4. Click "Upload"

### Chat with Documents
1. **RAG Mode**: Ask questions and get AI-generated answers with sources
2. **Search Mode**: Find specific content across documents
3. Select specific documents from the sidebar to limit scope

### Example Queries

**RAG Mode:**
- "What are the main conclusions in these documents?"
- "Summarize the key findings about climate change"
- "What recommendations are made for future research?"

**Search Mode:**
- "machine learning algorithms"
- "data analysis methodology"
- "statistical significance"

## API Endpoints

The frontend communicates with your RAG backend through these endpoints:

- `POST /api/upload` - Upload PDF files
- `GET /api/pdfs` - List uploaded documents
- `POST /api/search` - Search documents
- `POST /api/rag` - RAG queries
- `GET /api/stats` - System statistics
- `GET /api/health` - Health check

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RAG_API_URL` | `http://localhost:8000` | Backend API URL |
| `PORT` | `3000` | Frontend server port |
| `MAX_FILE_SIZE` | `10485760` | Max upload size (bytes) |
| `ALLOWED_FILE_TYPES` | `pdf` | Allowed file extensions |

### Backend Requirements

Ensure your RAG backend is running on the configured URL with these endpoints:
- `/api/v1/upload` - PDF upload
- `/api/v1/` - List PDFs
- `/api/v1/search/` - Document search
- `/api/v1/search/rag` - RAG queries
- `/api/v1/search/stats` - Statistics

## Development

### Project Structure
```
frontend/
├── server.js              # Main server file
├── public/                # Static files
│   ├── index.html        # Main HTML page
│   ├── css/style.css     # Styles
│   └── js/app.js         # Frontend JavaScript
├── src/                  # Server-side code
│   ├── config/           # Configuration
│   ├── routes/           # API routes
│   └── utils/            # Utilities
└── package.json          # Dependencies
```

### Adding Features

1. **New API Endpoints**: Add to `src/routes/api.js`
2. **Frontend Features**: Modify `public/js/app.js`
3. **Styling**: Update `public/css/style.css`
4. **Configuration**: Add to `src/config/config.js`

## Troubleshooting

### Common Issues

1. **Backend Connection Failed**
   - Check if RAG backend is running
   - Verify `RAG_API_URL` in `.env`
   - Check CORS settings on backend

2. **Upload Fails**
   - Check file size limits
   - Verify file type is PDF
   - Check backend storage configuration

3. **No Search Results**
   - Ensure PDFs are processed (status: completed)
   - Check if documents contain searchable text
   - Verify embedding service is running

### Logs

Check the console for detailed error messages:
```bash
npm run dev
```

## License

MIT License - see LICENSE file for details.
```

## **Step 6: Final Setup Commands**

Now let's set up and run the frontend:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start in development mode
npm run dev
```

## **Step 7: Test the Application**

1. **Start your RAG backend** (if not already running):
```bash
# In your RAG project root
cd C:\Users\User\PycharmProjects\RAG
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2. **Start the frontend**:
```bash
# In the frontend directory
cd frontend
npm run dev
```

3. **Open your browser** to `http://localhost:3000`

## **Complete Folder Structure**

Your final structure should look like this:

```
RAG/
├── frontend/
│   ├── server.js
│   ├── package.json
│   ├── .env
│   ├── .gitignore
│   ├── README.md
│   ├── public/
│   │   ├── index.html
│   │   ├── css/
│   │   │   └── style.css
│   │   └── js/
│   │       └── app.js
│   ├── src/
│   │   ├── config/
│   │   │   └── config.js
│   │   ├── routes/
│   │   │   └── api.js
│   │   └── utils/
│   │       └── ragClient.js
│   └── node_modules/
├── app/ (your existing RAG backend)
└── krbs_circulars_app/ (your existing Vue app)