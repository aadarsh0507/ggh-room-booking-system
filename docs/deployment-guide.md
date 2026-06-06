# Deployment Guide

## Prerequisites

- Docker and Docker Compose
- Node.js 16+ (for local development)
- MongoDB (or use Docker)

## Environment Setup

1. Copy environment files:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Update environment variables in `backend/.env`:
   - `MONGO_URI`: MongoDB connection string
   - `JWT_SECRET`: Secure random string
   - `HIS_API_URL`: HIS system API URL
   - `HIS_API_TOKEN`: HIS API authentication token

## Docker Deployment

1. Build and start services:
   ```bash
   docker-compose up -d
   ```

2. Check logs:
   ```bash
   docker-compose logs -f
   ```

3. Seed database:
   ```bash
   docker-compose exec backend npm run seed
   ```

## Manual Deployment

### Backend

1. Install dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Start server:
   ```bash
   npm run dev  # Development
   npm start    # Production
   ```

### Frontend

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Build for production:
   ```bash
   npm run build
   ```

3. Serve static files using nginx or similar.

## Production Considerations

### Security
- Use HTTPS in production
- Store secrets securely (not in code)
- Implement rate limiting
- Regular security audits

### Performance
- Use PM2 for process management
- Implement caching (Redis)
- Database indexing
- Monitor resource usage

### Monitoring
- Application logs
- Error tracking (Sentry)
- Performance monitoring
- Health checks

### Backup
- Database backups
- Configuration backups
- Regular testing of restore procedures

## Scaling

### Horizontal Scaling
- Use load balancer (nginx)
- Multiple backend instances
- Database read replicas

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Implement caching layers

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check MongoDB is running
   - Verify connection string
   - Check network connectivity

2. **Authentication Issues**
   - Verify JWT_SECRET
   - Check token expiration
   - Validate user credentials

3. **HIS Integration Issues**
   - Check HIS API endpoints
   - Verify authentication tokens
   - Review error logs

### Logs

- Backend logs: `docker-compose logs backend`
- Database logs: `docker-compose logs mongodb`
- Application logs: Check `/logs` directory

## Support

For deployment issues, contact the DevOps team.