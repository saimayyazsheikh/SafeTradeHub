FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download NLTK data
RUN python -m nltk.downloader punkt punkt_tab averaged_perceptron_tagger

# Copy project files
COPY . .

# Set environment variables
ENV PORT=5000

# Start command
CMD ["sh", "-c", "gunicorn --chdir backend -b 0.0.0.0:$PORT app:app"]
