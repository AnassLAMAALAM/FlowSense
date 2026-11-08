@echo off
REM FlowSense - build and start all containers; output is also saved to start.log
cd /d "%~dp0"
echo Building and starting FlowSense... (output saved to start.log)
docker compose up -d --build > start.log 2>&1
type start.log
echo. >> start.log
echo ===== docker compose ps ===== >> start.log
docker compose ps -a >> start.log 2>&1
echo ===== backend logs ===== >> start.log
docker compose logs --tail 40 backend >> start.log 2>&1
echo.
docker compose ps
echo.
echo Dashboard:   http://localhost:8080
echo Node-RED:    http://localhost:1880
echo Backend API: http://localhost:4000/api/health
echo.
echo Logs: docker compose logs -f     Stop: docker compose down
pause
