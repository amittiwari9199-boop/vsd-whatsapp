@echo off
title School WhatsApp Background Service (Port 3300)
cd /d "%~dp0"
echo ============================================================
echo Starting School WhatsApp Microservice Engine on Port 3300...
echo ============================================================
node server.js
pause
