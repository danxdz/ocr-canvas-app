# 🚀 Deployment Guide

## Quick Deploy Options

### 1. Render (Static Site) ⭐ **EASIEST & FREE**

1. **Push to GitHub** (if not already)
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo>
   git push -u origin main
   ```

2. **Go to Render Dashboard**
   - https://dashboard.render.com
   - Click **"New +"** → **"Static Site"**

3. **Connect Repository**
   - Select your GitHub repo
   - **Name**: `spacial-ocr-canvas`
   - **Branch**: `main` or `master`
   - **Root Directory**: Leave empty (or `SPaCial_AI/ocr-canvas-app` if in monorepo)
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

4. **Environment Variables**
   - Add: `VITE_API_URL` = `https://cooldan-spacial-server-api.hf.space`

5. **Click "Create Static Site"** → Done! ✅

---

### 2. Hugging Face Spaces (Docker)

1. **Create HF Space**
   - Go to https://huggingface.co/spaces
   - Click **"Create new Space"**
   - **Space Name**: `spacial-ocr-canvas`
   - **License**: MIT
   - **Space SDK**: **Docker**

2. **Upload Files**
   ```bash
   # Clone your HF Space
   git clone https://huggingface.co/spaces/YOUR_USERNAME/spacial-ocr-canvas
   cd spacial-ocr-canvas
   
   # Copy all files from ocr-canvas-app
   cp -r ../SPaCial_AI/ocr-canvas-app/* .
   
   # Push to HF
   git add .
   git commit -m "Deploy OCR Canvas"
   git push
   ```

3. **That's it!** HF will auto-build using your `Dockerfile`

---

### 3. Vercel (One-Click)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   cd SPaCial_AI/ocr-canvas-app
   vercel
   ```

3. **Set Environment Variable**
   - Go to Vercel dashboard → Your project → Settings → Environment Variables
   - Add: `VITE_API_URL` = `https://cooldan-spacial-server-api.hf.space`

---

### 4. Netlify (Drag & Drop)

1. **Build Locally**
   ```bash
   npm run build
   ```

2. **Go to Netlify**
   - https://app.netlify.com
   - Drag `dist` folder to "Sites" page

3. **Set Environment Variable**
   - Site settings → Environment → Add:
   - `VITE_API_URL` = `https://cooldan-spacial-server-api.hf.space`
   - Redeploy

---

## 🧪 Test Locally First

```bash
# Development mode
npm run dev

# Production build + preview
npm run build
npm run preview
```

---

## 🔧 CORS Configuration

If you get CORS errors, update your **backend** (`app.py`):

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://your-app.onrender.com",
        "https://your-app.vercel.app",
        # Add your deployed frontend URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 📱 Access Your App

After deployment, you'll get a URL like:
- Render: `https://spacial-ocr-canvas.onrender.com`
- HF: `https://huggingface.co/spaces/YOUR_USERNAME/spacial-ocr-canvas`
- Vercel: `https://spacial-ocr-canvas.vercel.app`
- Netlify: `https://spacial-ocr-canvas.netlify.app`

---

## ✅ Verification Checklist

- [ ] App loads successfully
- [ ] Can upload images
- [ ] Auto-detection works
- [ ] Canvas is interactive
- [ ] Click-to-find works
- [ ] Export JSON downloads correctly
- [ ] Telegram send works

---

## 🐛 Troubleshooting

### "Failed to fetch" or CORS errors
→ Add your frontend URL to backend CORS settings

### "No zones detected"
→ Check API_URL in environment variables
→ Verify backend is running: `curl https://cooldan-spacial-server-api.hf.space/`

### Canvas not responding
→ Check browser console (F12)
→ Verify image loaded successfully

---

## 🎉 Recommended: Render

**Why Render?**
- ✅ Free tier is generous
- ✅ Auto-deploys from Git
- ✅ Easy environment variables
- ✅ Good performance
- ✅ Custom domains (free)
- ✅ HTTPS by default

Total setup time: **< 5 minutes**!

