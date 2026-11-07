@echo off
REM Smart Traffic Management System - build and start all containers
docker compose up -d --build
echo.
echo Dashboard:   http://localhost:8080
echo Node-RED:    http://localhost:1880
echo Backend API: http://localhost:4000/api/health
echo.
echo Logs: docker compose logs -f     Stop: docker compose down
