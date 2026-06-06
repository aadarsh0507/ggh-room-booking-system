# Hospital Room Booking & Allotment Module - API Documentation

## Overview

This document provides detailed API documentation for the Hospital Room Booking & Allotment Module.

## Authentication

All API endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### POST /api/auth/login
Login user and return JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:**
```json
{
  "_id": "user_id",
  "username": "username",
  "email": "user@example.com",
  "role": "Admin",
  "token": "jwt_token"
}
```

### Rooms

#### GET /api/rooms
Get all rooms with optional filters.

**Query Parameters:**
- `status`: Filter by room status
- `category`: Filter by room category
- `floor`: Filter by floor

**Response:**
```json
[
  {
    "_id": "room_id",
    "roomNumber": "101",
    "floor": "1",
    "wing": "A",
    "category": "General Ward",
    "status": "Available",
    "bedCount": 4,
    "price": 100,
    "amenities": ["TV", "WiFi"],
    "genderRestriction": "None",
    "isIsolation": false
  }
]
```

#### GET /api/rooms/availability
Get room availability summary.

**Response:**
```json
[
  {
    "_id": "room_id",
    "roomNumber": "101",
    "floor": "1",
    "wing": "A",
    "category": "General Ward",
    "status": "Available",
    "availableBeds": 4,
    "totalBeds": 4
  }
]
```

### Patients

#### GET /api/patients/search?q=search_term
Search patients from HIS system.

**Response:**
```json
[
  {
    "uhid": "UHID123",
    "patientId": "PAT123",
    "name": "John Doe",
    "gender": "Male",
    "dob": "1990-01-01",
    "doctor": "Dr. Smith",
    "department": "Cardiology",
    "insurance": "Insurance Co"
  }
]
```

### Admissions

#### POST /api/admissions
Admit a patient to a bed.

**Request Body:**
```json
{
  "patient": "patient_id",
  "bed": "bed_id",
  "room": "room_id",
  "admissionType": "Planned",
  "estimatedDischargeDate": "2023-12-31"
}
```

**Response:**
```json
{
  "_id": "admission_id",
  "patient": "patient_id",
  "bed": "bed_id",
  "room": "room_id",
  "admissionDate": "2023-12-01T00:00:00.000Z",
  "status": "Admitted"
}
```

### Billing

#### GET /api/billing/admission/:admissionId
Get billing information for an admission.

**Response:**
```json
{
  "_id": "billing_id",
  "admission": "admission_id",
  "patient": "patient_id",
  "roomCharges": [],
  "bedCharges": [],
  "totalAmount": 0,
  "paidAmount": 0,
  "status": "Pending"
}
```

## Error Responses

All errors follow this format:

```json
{
  "message": "Error description",
  "stack": "Error stack (development only)"
}
```

Common HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Rate Limiting

API endpoints are rate limited to prevent abuse. Contact administrator for limits.

## Support

For API support, contact the development team.