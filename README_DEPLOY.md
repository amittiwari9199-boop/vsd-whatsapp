# V.S.D. International School - WhatsApp Microservice Deployment Guide

## Kyun aati hai "Local WhatsApp Service Offline" error InfinityFree par?
InfinityFree ek **PHP Shared Web Hosting** service hai:
- InfinityFree par Node.js install nahi ho sakta.
- Port 3300 ya koi bhi background daemon process shared hosting par block hoti hai.
- Isliye WhatsApp Baileys engine (jo Node.js par chalta hai) InfinityFree ke server ke andar direct run nahi ho sakta.

---

## 2 Aasan aur Permanent Solutions:

### Option 1: 100% Free 24/7 Cloud Host (Render.com) - [Recommended - Permanent Online]
Is method se aapka WhatsApp server 24 ghante online rahega, bina kisi PC ko on rakhe:

1. [https://render.com](https://render.com) par free account banayein.
2. **"New +"** par click karein aur **"Web Service"** choose karein.
3. Apna GitHub repository connect karein (ya `whatsapp_service` folder deploy karein).
4. Settings me fill karein:
   - **Root Directory**: `whatsapp_service`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free` ($0/month)
5. **Deploy Web Service** par click karein.
6. Render aapko ek live permanent HTTPS URL dega (e.g., `https://vsd-whatsapp.onrender.com`).
7. Apne School ERP me jayein:
   - URL: `https://vsd.site.je/communication/whatsapp`
   - Right side me **"WhatsApp Microservice Endpoint URL"** me apna Render URL paste karein.
   - Click **Save Gateway Settings**.
8. Live QR Code screen par aa jayega! School handset se scan karein aur WhatsApp hamesha ke liye connect ho jayega!

---

### Option 2: 1-Click Instant PC Cloud Tunnel (Turant QR Code dekhne ke liye)
Agar aapke paas school ka PC ya laptop hai:

1. `c:\SMS\start_whatsapp_with_tunnel.bat` file par double-click karein.
2. Console window me WhatsApp service start hogi aur ek live public HTTPS URL aayega (e.g. `https://xyz.loca.lt`).
3. Woh URL copy karke `https://vsd.site.je/communication/whatsapp` me **WhatsApp Microservice Endpoint URL** me paste karke Save kar dein.
4. `vsd.site.je` par instant QR Code render ho jayega!
