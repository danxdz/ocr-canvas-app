# Dockerfile for Hugging Face Spaces deployment

FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Install serve to run the static site
RUN npm install -g serve

# Expose HF Spaces port
EXPOSE 7860

# Set environment variable for API URL
ENV VITE_API_URL=https://cooldan-spacial-server-api.hf.space

# Serve the built app
CMD ["serve", "-s", "dist", "-l", "7860"]

