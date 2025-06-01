#!/bin/bash

# Development startup script for Clauditor
# Starts both backend service and Electron app

echo "Starting Clauditor development environment..."

# Function to kill background processes on exit
cleanup() {
    echo "Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $ELECTRON_PID 2>/dev/null
    exit
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start backend service
echo "Starting backend service..."
cd server
CLAUDE_PROJECTS_PATH="$(pwd)/test-data" npm run dev &
BACKEND_PID=$!
cd ..

# Wait for backend to start
echo "Waiting for backend service to start..."
sleep 3

# Check if backend is running
if curl -s http://localhost:3001/health > /dev/null; then
    echo "Backend service is running ✓"
else
    echo "Backend service failed to start ✗"
    cleanup
fi

# Start Electron app
echo "Starting Electron app..."
npm run electron:dev &
ELECTRON_PID=$!

echo ""
echo "🚀 Clauditor development environment is running!"
echo ""
echo "Backend API: http://localhost:3001"
echo "Frontend: Electron app window"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for background processes
wait