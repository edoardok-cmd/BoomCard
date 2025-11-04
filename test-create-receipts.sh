#!/bin/bash

# Login and get token
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@boomcard.bg","password":"demo123"}' \
  -s | jq -r '.data.accessToken')

echo "Token obtained: ${TOKEN:0:50}..."

# Create Receipt 1 - Kaufland (will be PENDING)
echo ""
echo "Creating receipt 1 - Kaufland..."
curl -X POST http://localhost:3001/api/receipts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "merchantName": "Kaufland",
    "totalAmount": 45.80,
    "date": "2025-11-03T10:30:00Z",
    "rawText": "KAUFLAND BULGARIA\nул. Витоша 123\nСофия\n\nХляб 2.50\nМляко 3.20\nСирене 8.90\n\nОБЩО: 45.80 лв",
    "confidence": 0.92,
    "items": [
      {"name": "Хляб", "price": 2.50, "quantity": 1},
      {"name": "Мляко", "price": 3.20, "quantity": 1},
      {"name": "Сирене", "price": 8.90, "quantity": 1}
    ]
  }' -s | jq

# Create Receipt 2 - Billa
echo ""
echo "Creating receipt 2 - Billa..."
curl -X POST http://localhost:3001/api/receipts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "merchantName": "Billa",
    "totalAmount": 32.50,
    "date": "2025-11-02T15:20:00Z",
    "rawText": "BILLA\nбул. Витошка 45\nСофия\n\nПлодове 12.30\nЗеленчуци 8.90\nМесо 11.30\n\nОБЩО: 32.50 лв",
    "confidence": 0.88,
    "items": [
      {"name": "Плодове", "price": 12.30, "quantity": 1},
      {"name": "Зеленчуци", "price": 8.90, "quantity": 1},
      {"name": "Месо", "price": 11.30, "quantity": 1}
    ]
  }' -s | jq

# Create Receipt 3 - Lidl
echo ""
echo "Creating receipt 3 - Lidl..."
curl -X POST http://localhost:3001/api/receipts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "merchantName": "Lidl",
    "totalAmount": 28.90,
    "date": "2025-11-01T12:10:00Z",
    "rawText": "LIDL\nул. Граф Игнатиев 78\nСофия\n\nХляб 1.80\nКафе 8.90\nШоколад 5.20\n\nОБЩО: 28.90 лв",
    "confidence": 0.95,
    "items": [
      {"name": "Хляб", "price": 1.80, "quantity": 1},
      {"name": "Кафе", "price": 8.90, "quantity": 1},
      {"name": "Шоколад", "price": 5.20, "quantity": 1}
    ]
  }' -s | jq

# Create Receipt 4 - Fantastico
echo ""
echo "Creating receipt 4 - Fantastico..."
curl -X POST http://localhost:3001/api/receipts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "merchantName": "Fantastico",
    "totalAmount": 56.40,
    "date": "2025-10-31T18:45:00Z",
    "rawText": "FANTASTICO\nбул. България 102\nСофия\n\nМесо 23.50\nРиба 18.90\nПлодове 14.00\n\nОБЩО: 56.40 лв",
    "confidence": 0.90,
    "items": [
      {"name": "Месо", "price": 23.50, "quantity": 1},
      {"name": "Риба", "price": 18.90, "quantity": 1},
      {"name": "Плодове", "price": 14.00, "quantity": 1}
    ]
  }' -s | jq

# Create Receipt 5 - Kaufland (second one)
echo ""
echo "Creating receipt 5 - Kaufland (second visit)..."
curl -X POST http://localhost:3001/api/receipts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "merchantName": "Kaufland",
    "totalAmount": 38.20,
    "date": "2025-10-30T09:15:00Z",
    "rawText": "KAUFLAND BULGARIA\nул. Витоша 123\nСофия\n\nМляко 6.40\nЯйца 5.80\nМасло 12.00\n\nОБЩО: 38.20 лв",
    "confidence": 0.93,
    "items": [
      {"name": "Мляко", "price": 6.40, "quantity": 2},
      {"name": "Яйца", "price": 5.80, "quantity": 1},
      {"name": "Масло", "price": 12.00, "quantity": 1}
    ]
  }' -s | jq

echo ""
echo "✅ All test receipts created!"
echo ""
echo "Now checking receipt stats..."
curl -X GET http://localhost:3001/api/receipts/stats \
  -H "Authorization: Bearer $TOKEN" \
  -s | jq
