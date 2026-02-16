#!/bin/bash
# Test script for classification system

BASE_URL="http://localhost:3001"

echo "🧪 Testing Classification System"
echo "================================"
echo ""

# Test 1: Register actors
echo "1️⃣ Registering actors..."
curl -s -X POST $BASE_URL/api/actors \
  -H "Content-Type: application/json" \
  -d '{"actors":[{"name":"Alice"},{"name":"Bob"},{"name":"Charlie"}]}' | jq '.success'
echo ""

# Test 2: Normal conversation (should NOT flag)
echo "2️⃣ Normal conversation..."
curl -s -X POST $BASE_URL/api/conversation \
  -H "Content-Type: application/json" \
  -d '{"speaker":"Alice","listener":"Bob","message":"Hey Bob, how was your day today?"}' | jq '.classification | {flagged, riskScore, clusters}'
echo ""

# Test 3: Extremism conversation (SHOULD FLAG)
echo "3️⃣ Extremism conversation..."
curl -s -X POST $BASE_URL/api/conversation \
  -H "Content-Type: application/json" \
  -d '{"speaker":"Charlie","listener":"Alice","message":"We need to organize violent attacks and destroy the government. Time for revolution!"}' | jq '.classification | {flagged, riskScore, clusters}'
echo ""

# Test 4: Conspiracy conversation (SHOULD FLAG)
echo "4️⃣ Conspiracy conversation..."
curl -s -X POST $BASE_URL/api/conversation \
  -H "Content-Type: application/json" \
  -d '{"speaker":"Bob","listener":"Charlie","message":"The deep state and illuminati are controlling everything. This is a massive coverup and false flag!"}' | jq '.classification | {flagged, riskScore, clusters}'
echo ""

# Test 5: Radicalization conversation (SHOULD FLAG)
echo "5️⃣ Radicalization conversation..."
curl -s -X POST $BASE_URL/api/conversation \
  -H "Content-Type: application/json" \
  -d '{"speaker":"Alice","listener":"Bob","message":"Enough talking, time for action! We must rise up and fight back now!"}' | jq '.classification | {flagged, riskScore, clusters}'
echo ""

# Test 6: Get all actors with risk scores
echo "6️⃣ Final actor status..."
curl -s $BASE_URL/api/actors | jq '.actors[] | {name, flagged, riskScore, clusters}'
echo ""

echo "✅ Test complete! Check frontend for visual results."
