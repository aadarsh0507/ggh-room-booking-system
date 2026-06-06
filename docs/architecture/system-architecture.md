# System Architecture

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   HIS System    │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (External)    │
│                 │    │                 │    │                 │
│ - Login         │    │ - Controllers   │    │ - Patient Data  │
│ - Dashboard     │    │ - Services      │    │ - Billing       │
│ - Room Booking  │    │ - Middleware    │    │ - Admissions    │
│ - Reports       │    │ - Validation    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Database      │
                    │   (MongoDB)     │
                    │                 │
                    │ - Rooms         │
                    │ - Beds          │
                    │ - Patients      │
                    │ - Admissions    │
                    │ - Billing       │
                    │ - Audit Logs    │
                    │ - Users         │
                    └─────────────────┘
```

## Component Details

### Frontend Layer
- **Technology**: React + Tailwind CSS
- **Responsibilities**:
  - User interface and interactions
  - Form validation
  - Real-time updates via WebSocket
  - Responsive design
- **Key Components**:
  - Login/Register forms
  - Dashboard with statistics
  - Room availability grid
  - Booking wizard
  - Patient search
  - Reports and analytics

### Backend Layer
- **Technology**: Node.js + Express.js
- **Architecture**: REST API with MVC pattern
- **Responsibilities**:
  - Business logic implementation
  - Data validation and sanitization
  - Authentication and authorization
  - HIS system integration
  - Real-time notifications
- **Key Modules**:
  - Controllers: Handle HTTP requests
  - Services: Business logic
  - Models: Data schemas
  - Middleware: Auth, validation, logging
  - Routes: API endpoints

### Database Layer
- **Technology**: MongoDB
- **Design**: Document-based with relationships
- **Key Collections**:
  - Rooms: Room information and configuration
  - Beds: Individual bed tracking
  - Patients: Patient data (synced from HIS)
  - Admissions: Admission records
  - Billing: Charges and payments
  - AuditLogs: Activity tracking
  - Users: System users and roles
  - Notifications: System notifications

### HIS Integration Layer
- **Purpose**: Seamless integration with existing Hospital Information System
- **Features**:
  - Patient data synchronization
  - Admission workflow integration
  - Billing data exchange
  - Doctor and department mapping
- **Implementation**:
  - REST API calls with retry mechanism
  - Queue-based processing
  - Webhook support
  - Token-based authentication

## Data Flow

1. **Patient Admission**:
   - User searches patient in HIS
   - System fetches patient data
   - User selects room/bed
   - System creates admission record
   - Updates room/bed status
   - Sends real-time notifications

2. **Billing Process**:
   - System calculates daily charges
   - Syncs with HIS billing system
   - Tracks payments and insurance
   - Generates reports

3. **Real-time Updates**:
   - WebSocket connections for live updates
   - Room status changes
   - Bed availability
   - Notifications

## Security Architecture

- **Authentication**: JWT tokens
- **Authorization**: Role-based access control
- **Data Protection**: Input validation, sanitization
- **API Security**: Rate limiting, CORS
- **Audit Trail**: Comprehensive logging

## Scalability Considerations

- **Horizontal Scaling**: Stateless backend services
- **Database Scaling**: Indexing, read replicas
- **Caching**: Redis for session and data caching
- **Load Balancing**: Nginx reverse proxy
- **Microservices Ready**: Modular architecture for future splitting