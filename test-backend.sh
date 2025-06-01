#!/bin/bash

# Backend API test script for Clauditor

echo "Testing Clauditor Backend API..."

BASE_URL="http://localhost:3001"

# Test health endpoint
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq .
echo ""

# Test scan projects endpoint
echo "2. Testing scan projects endpoint..."
curl -s "$BASE_URL/api/filesystem/scan-projects?includeStats=true" | jq .
echo ""

# Test path validation
echo "3. Testing path validation..."
curl -s -X POST "$BASE_URL/api/filesystem/validate-path" \
  -H "Content-Type: application/json" \
  -d '{"path":"./server/test-data"}' | jq .
echo ""

echo "Backend API testing completed!"