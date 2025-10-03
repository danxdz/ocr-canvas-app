# ⚡ Quick Start Guide

## 🚀 Get Running in 30 Seconds

### 1. Install Dependencies
```bash
cd SPaCial_AI/ocr-canvas-app
npm install
```

### 2. Start Dev Server
```bash
npm run dev
```

### 3. Open Browser
```
http://localhost:5173
```

That's it! 🎉

---

## 🎯 How to Use

### Step 1: Upload Image
- Click the **"Upload Technical Drawing"** button
- Select a technical drawing/blueprint image
- Wait for auto-detection...

### Step 2: Review Detected Zones
- Zones appear on the canvas with **blue boxes**
- See zone list on the right side
- Each zone shows:
  - Text content
  - Confidence percentage
  - Zone number

### Step 3: Interact with Canvas

**Select a zone:**
- Click on any zone → Turns **green**

**Find more text:**
- Click on empty space → Detects text at that point

**Move a zone:**
- Select zone → Drag it to new position

**Delete a zone:**
- Select zone → Press **Delete** or **Backspace** key
- Or click 🗑️ in zone list

### Step 4: Export Results

**Download JSON:**
- Click **"📥 Export JSON"**
- Gets all zones with cropped images
- Downloads as `ocr_zones_<timestamp>.json`

**Send to Telegram:**
- Click **"📤 Send to Telegram"**
- Sends all data to your Telegram bot

### Step 5: Process Another Image
- Click **"🔄 New Image"**
- Upload next drawing
- Repeat!

---

## 🎨 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete selected zone |
| `Esc` | Deselect zone |
| Click canvas | Find text at point |
| Drag zone | Move zone |

---

## ⚙️ Configuration

### Change API Server

Edit `src/services/api.ts`:

```typescript
const API_URL = 'http://localhost:8000'; // Your local server
// or
const API_URL = 'https://your-server.com'; // Your deployed server
```

### Environment Variables

Create `.env` file:

```env
VITE_API_URL=https://cooldan-spacial-server-api.hf.space
```

---

## 🏗️ Build for Production

```bash
# Build
npm run build

# Preview build
npm run preview
```

Output folder: `dist/`

---

## 🚀 Deploy to Render (Fastest)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready to deploy"
   git push
   ```

2. **Go to Render**
   - https://dashboard.render.com
   - New + → Static Site
   - Connect your GitHub repo

3. **Configure**
   - Build: `npm install && npm run build`
   - Publish: `dist`
   - Env var: `VITE_API_URL` = `https://cooldan-spacial-server-api.hf.space`

4. **Deploy** → Done! ✅

---

## 🐛 Troubleshooting

### "Cannot connect to server"
**Fix**: Check `VITE_API_URL` in `.env` or `src/services/api.ts`

### "CORS error"
**Fix**: Add your frontend URL to backend CORS settings in `app.py`:
```python
allow_origins=["http://localhost:5173", "https://your-app.onrender.com"]
```

### Canvas not responding
**Fix**: 
1. Open browser console (F12)
2. Check for JavaScript errors
3. Verify image loaded successfully

### Build fails
**Fix**: 
1. Delete `node_modules/` and `package-lock.json`
2. Run `npm install`
3. Try `npm run build` again

---

## 📱 Mobile Support

The app is responsive! Works on:
- ✅ Desktop (best experience)
- ✅ Tablet
- ⚠️ Mobile (limited canvas interaction)

---

## 🎉 You're Ready!

Open http://localhost:5173 and start annotating! 🚀

**Questions?** Check:
- `README.md` - Detailed usage
- `DEPLOY.md` - Deployment options
- `PROJECT_SUMMARY.md` - Technical details

---

**Happy OCR-ing!** 🎨

