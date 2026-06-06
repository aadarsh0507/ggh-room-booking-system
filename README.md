# Hospital Room Booking & Allotment Module

A modern hospital room booking and allotment system integrated with an existing HIS (Hospital Information System).

## Features

- Room and bed management
- Patient admission and discharge workflow
- Real-time room availability tracking
- HIS integration for patient data
- Billing and insurance integration
- Role-based access control
- Audit logging
- Real-time notifications via Socket.IO
- Mobile-responsive UI

## Tech Stack

- **Frontend**: React + Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: MongoDB
- **Authentication**: JWT + Role-Based Access
- **Real-time**: Socket.IO
- **Deployment**: Docker, PM2, NGINX

## Quick Start

### Prerequisites

- Node.js >= 16
- MongoDB
- npm or yarn

### Installation

1. Clone the repository
2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```
3. Install frontend dependencies:
   ```bash
   cd ../frontend
   npm install
   ```
4. Set up environment variables:
   - Copy `backend/.env.example` to `backend/.env`
   - Update the values as needed

5. Start MongoDB

6. Start the backend:
   ```bash
   cd backend
   npm run dev
   ```

7. Start the frontend:
   ```bash
   cd frontend
   npm start
   ```

## API Documentation

API documentation is available at `http://localhost:5000/api-docs` when the server is running.

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── config/
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│   ├── public/
│   └── package.json
├── docs/
├── tests/
├── docker/
└── scripts/
```

## Environment Variables

See `backend/.env.example` for required environment variables.

## Deployment

### Docker

```bash
docker-compose up
```

### Production

1. Build the frontend:
   ```bash
   cd frontend
   npm run build
   ```

2. Start the backend with PM2:
   ```bash
   cd backend
   npm run build
   pm2 start ecosystem.config.js
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

This project is licensed under the ISC License.