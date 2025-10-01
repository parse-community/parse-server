# GDPR Compliance Guide for Parse Server

## Overview

**Parse Server provides audit logging infrastructure. Everything else is your responsibility.**

This guide clarifies:
1. What Parse Server provides
2. What you (the developer) must implement
3. What your organization must ensure

## Part 1: What Parse Server Provides ✅

### Audit Logging (Infrastructure Level)

Parse Server includes a comprehensive audit logging system that tracks:

- **User Authentication** - Login attempts (successful and failed)
- **Data Access** - All read operations on Parse objects
- **Data Modifications** - Create, update, and delete operations
- **ACL Changes** - Access control list modifications
- **Schema Changes** - Schema creation, modification, and deletion
- **Push Notifications** - Push notification sends

**Key Features:**
- Automatic, transparent logging at the database level
- Structured JSON format for easy parsing
- Daily log rotation with configurable retention
- Automatic masking of sensitive data (passwords, session tokens)
- IP address tracking
- Configurable via code or environment variables

**What This Means:**
- You get automatic compliance with GDPR Article 30 (Records of Processing Activities)
- You have an audit trail for Article 33 (Data Breach Notification)
- You have evidence for Article 32 (Security of Processing)

**Configuration:**
```javascript
new ParseServer({
  // ... other options
  auditLog: {
    auditLogFolder: './audit-logs',  // Required to enable
    datePattern: 'YYYY-MM-DD',        // Optional (default: daily rotation)
    maxSize: '20m',                   // Optional (default: 20MB per file)
    maxFiles: '14d',                  // Optional (default: 14 days retention)
  }
});
```

### That's It

Parse Server provides **only** audit logging because:
- It's framework-level infrastructure
- Requires deep integration with database operations
- Must be automatic and transparent
- Developers cannot reliably implement it themselves

Everything else is application-specific and must be implemented by you.

---

## Part 2: What You Must Implement 👨‍💻

GDPR compliance requires application-specific features that **you must build** using standard Parse Server APIs.

### 1. Right to Access (Article 15) - Data Export

**What:** Users must be able to request a copy of all their personal data.

**Your Responsibility:**
- Know your data model and relationships
- Aggregate all user data across all classes
- Format the export (JSON, CSV, PDF, etc.)
- Deliver to the user

**Implementation Example (Cloud Code):**

```javascript
// Cloud Code function to export user data
Parse.Cloud.define('exportMyData', async (request) => {
  const exportData = {
    exportDate: new Date().toISOString(),
    user: request.user.toJSON(),
    relatedData: {}
  };

  // Query all classes in parallel for better performance
  const [orders, reviews, comments] = await Promise.all([
    new Parse.Query('Order')
      .equalTo('user', request.user)
      .find({ useMasterKey: true }),

    new Parse.Query('Review')
      .equalTo('author', request.user)
      .find({ useMasterKey: true }),

    new Parse.Query('Comment')
      .equalTo('author', request.user)
      .find({ useMasterKey: true }),

    // Add more queries as needed for your application
  ]);

  exportData.relatedData.orders = orders.map(o => o.toJSON());
  exportData.relatedData.reviews = reviews.map(r => r.toJSON());
  exportData.relatedData.comments = comments.map(c => c.toJSON());

  // Include audit logs for this user
  // (You'll need to query your audit log files)

  return exportData;
}, {
  requireUser: true
});
```

**Response Time:** Must respond within 30 days (Article 12).

---

### 2. Right to Erasure / "Right to be Forgotten" (Article 17) - Data Deletion

**What:** Users can request deletion of their personal data.

**Your Responsibility:**
- Implement business rules (what can/cannot be deleted)
- Handle legal retention requirements (e.g., financial records)
- Decide: delete vs. anonymize
- Handle cascading deletes or orphaned data
- Verify user identity before deletion

**Implementation Example (Cloud Code):**

```javascript
Parse.Cloud.define('deleteMyData', async (request) => {
  // STEP 1: Check if deletion is allowed
  const activeOrders = await new Parse.Query('Order')
    .equalTo('user', request.user)
    .equalTo('status', 'active')
    .count({ useMasterKey: true });

  if (activeOrders > 0) {
    throw new Error('Cannot delete account with active orders. Please cancel or complete orders first.');
  }

  // STEP 2: Handle data based on legal requirements

  // Query all related data in parallel
  const [allOrders, reviews, comments, wishlistItems] = await Promise.all([
    new Parse.Query('Order')
      .equalTo('user', request.user)
      .find({ useMasterKey: true }),

    new Parse.Query('Review')
      .equalTo('author', request.user)
      .find({ useMasterKey: true }),

    new Parse.Query('Comment')
      .equalTo('author', request.user)
      .find({ useMasterKey: true }),

    new Parse.Query('WishlistItem')
      .equalTo('user', request.user)
      .find({ useMasterKey: true }),
  ]);

  // ANONYMIZE financial records (legal requirement to retain)
  for (const order of allOrders) {
    order.set('user', null);
    order.set('userName', 'DELETED_USER');
    order.set('userEmail', 'deleted@example.com');
    order.set('userPhone', null);
    await order.save(null, { useMasterKey: true });
  }

  // DELETE reviews, comments, and wishlist items in parallel
  await Promise.all([
    Parse.Object.destroyAll(reviews, { useMasterKey: true }),
    Parse.Object.destroyAll(comments, { useMasterKey: true }),
    Parse.Object.destroyAll(wishlistItems, { useMasterKey: true }),
  ]);

  // STEP 3: Delete user sessions
  const sessions = await new Parse.Query('_Session')
    .equalTo('user', request.user)
    .find({ useMasterKey: true });
  await Parse.Object.destroyAll(sessions, { useMasterKey: true });

  // STEP 4: Delete the user
  await request.user.destroy({ useMasterKey: true });

  // STEP 5: Log the deletion in audit logs
  // (This happens automatically via Parse Server's audit logging)

  return {
    success: true,
    message: 'Account and personal data deleted',
    retainedData: 'Order history anonymized per legal requirements'
  };
}, {
  requireUser: true
});
```

**Important Considerations:**
- **Verification:** Ensure the user is who they claim to be
- **Confirmation:** Require explicit confirmation (e.g., "type DELETE to confirm")
- **Irreversible:** Warn users that deletion is permanent
- **Legal Retention:** Some data must be retained (financial, tax, legal)
- **Exceptions:** You can refuse deletion if there's a legal basis (Article 17.3)

---

### 3. Right to Data Portability (Article 20) - Structured Export

**What:** Users can receive their data in a machine-readable format and transmit it to another service.

**Your Responsibility:**
- Export data in structured format (JSON, CSV, XML)
- Include only data provided by the user or generated by their use
- Make it compatible with other systems

**Implementation Example:**

```javascript
Parse.Cloud.define('exportDataPortable', async (request) => {
  const { format = 'json' } = request.params; // json, csv, xml

  // Export user-provided data only
  const exportData = {
    personalInfo: {
      username: request.user.get('username'),
      email: request.user.get('email'),
      name: request.user.get('name'),
      phone: request.user.get('phone'),
      createdAt: request.user.get('createdAt'),
    },
    content: {
      reviews: [],
      comments: [],
      posts: []
    }
  };

  // User-generated content
  const reviews = await new Parse.Query('Review')
    .equalTo('author', request.user)
    .find({ useMasterKey: true });
  exportData.content.reviews = reviews.map(r => ({
    productId: r.get('product').id,
    rating: r.get('rating'),
    text: r.get('text'),
    createdAt: r.get('createdAt'),
  }));

  // Convert to requested format
  if (format === 'csv') {
    return convertToCSV(exportData);
  } else if (format === 'xml') {
    return convertToXML(exportData);
  } else {
    return exportData; // JSON
  }
}, {
  requireUser: true
});
```

---

### 4. Consent Management (Article 7)

**What:** Track and manage user consent for data processing.

**Your Responsibility:**
- Create schema for consent
- Record when consent was given
- Allow users to withdraw consent
- Check consent before processing
- Version control consent forms

**Implementation Example:**

**Schema:**
```javascript
// Create Consent schema (run once)
const consentSchema = new Parse.Schema('Consent');
consentSchema.addPointer('user', '_User');
consentSchema.addString('type'); // 'marketing', 'analytics', 'essential'
consentSchema.addBoolean('granted');
consentSchema.addString('version'); // Version of consent form
consentSchema.addDate('grantedAt');
consentSchema.addDate('withdrawnAt');
consentSchema.addString('ipAddress');
consentSchema.save();
```

**Grant Consent:**
```javascript
Parse.Cloud.define('grantConsent', async (request) => {
  const { consentType, version } = request.params;

  const consent = new Parse.Object('Consent');
  consent.set('user', request.user);
  consent.set('type', consentType);
  consent.set('granted', true);
  consent.set('version', version);
  consent.set('grantedAt', new Date());
  consent.set('ipAddress', request.ip);

  await consent.save(null, { useMasterKey: true });
  return { success: true };
}, {
  requireUser: true
});
```

**Withdraw Consent:**
```javascript
Parse.Cloud.define('withdrawConsent', async (request) => {
  const { consentType } = request.params;

  const consent = await new Parse.Query('Consent')
    .equalTo('user', request.user)
    .equalTo('type', consentType)
    .equalTo('granted', true)
    .first({ useMasterKey: true });

  if (consent) {
    consent.set('granted', false);
    consent.set('withdrawnAt', new Date());
    await consent.save(null, { useMasterKey: true });
  }

  return { success: true };
}, {
  requireUser: true
});
```

**Check Consent Before Processing:**
```javascript
Parse.Cloud.beforeSave('MarketingEmail', async (request) => {
  const recipient = request.object.get('recipient');

  // Check if user has consented to marketing
  const consent = await new Parse.Query('Consent')
    .equalTo('user', recipient)
    .equalTo('type', 'marketing')
    .equalTo('granted', true)
    .first({ useMasterKey: true });

  if (!consent) {
    throw new Error('User has not consented to marketing emails');
  }
});
```

---

### 5. Data Retention & Lifecycle Management

**What:** Automatically delete or anonymize data after retention period.

**Your Responsibility:**
- Define retention periods for each data type
- Implement scheduled cleanup jobs
- Balance GDPR (minimize retention) vs. legal requirements (retain financial data)

**Implementation Example:**

```javascript
// Scheduled job (runs daily)
Parse.Cloud.job('enforceDataRetention', async (request) => {
  const { message } = request;

  // RETENTION POLICY 1: Delete inactive users after 2 years
  const inactiveThreshold = new Date();
  inactiveThreshold.setFullYear(inactiveThreshold.getFullYear() - 2);

  const inactiveUsers = await new Parse.Query('_User')
    .lessThan('lastLoginAt', inactiveThreshold)
    .find({ useMasterKey: true });

  message(`Found ${inactiveUsers.length} inactive users`);

  for (const user of inactiveUsers) {
    // Use your deletion logic
    try {
      await Parse.Cloud.run('deleteMyData', {}, {
        sessionToken: user.getSessionToken(),
        useMasterKey: true
      });
      message(`Deleted inactive user: ${user.id}`);
    } catch (error) {
      message(`Error deleting user ${user.id}: ${error.message}`);
    }
  }

  // RETENTION POLICY 2: Delete old sessions after 90 days
  const sessionThreshold = new Date();
  sessionThreshold.setDate(sessionThreshold.getDate() - 90);

  const oldSessions = await new Parse.Query('_Session')
    .lessThan('createdAt', sessionThreshold)
    .find({ useMasterKey: true });

  await Parse.Object.destroyAll(oldSessions, { useMasterKey: true });
  message(`Deleted ${oldSessions.length} old sessions`);

  // RETENTION POLICY 3: Anonymize old orders after 7 years (legal requirement)
  const orderThreshold = new Date();
  orderThreshold.setFullYear(orderThreshold.getFullYear() - 7);

  const oldOrders = await new Parse.Query('Order')
    .lessThan('createdAt', orderThreshold)
    .find({ useMasterKey: true });

  for (const order of oldOrders) {
    order.set('userName', 'ANONYMIZED');
    order.set('userEmail', 'anonymized@example.com');
    order.set('shippingAddress', null);
    order.set('billingAddress', null);
    await order.save(null, { useMasterKey: true });
  }
  message(`Anonymized ${oldOrders.length} old orders`);
});
```

**Schedule the job:**
```javascript
// In your server initialization
const schedule = require('node-schedule');

// Run daily at 2 AM
schedule.scheduleJob('0 2 * * *', async () => {
  await Parse.Cloud.startJob('enforceDataRetention');
});
```

---

### 6. Privacy Policy Management

**What:** Track user acceptance of privacy policies and notify of changes.

**Your Responsibility:**
- Create and maintain privacy policy
- Version control
- Track user acceptances
- Notify users of material changes

**Implementation Example:**

**Schema:**
```javascript
const policySchema = new Parse.Schema('PrivacyPolicyAcceptance');
policySchema.addPointer('user', '_User');
policySchema.addString('version');
policySchema.addDate('acceptedAt');
policySchema.addString('ipAddress');
policySchema.save();
```

**Track Acceptance:**
```javascript
Parse.Cloud.define('acceptPrivacyPolicy', async (request) => {
  const { version } = request.params;

  const acceptance = new Parse.Object('PrivacyPolicyAcceptance');
  acceptance.set('user', request.user);
  acceptance.set('version', version);
  acceptance.set('acceptedAt', new Date());
  acceptance.set('ipAddress', request.ip);

  await acceptance.save(null, { useMasterKey: true });

  // Update user's current policy version
  request.user.set('currentPolicyVersion', version);
  await request.user.save(null, { useMasterKey: true });

  return { success: true };
}, {
  requireUser: true
});
```

**Check if User Needs to Accept New Policy:**
```javascript
Parse.Cloud.define('checkPolicyStatus', async (request) => {
  const currentVersion = '2.0'; // Your current policy version

  const userVersion = request.user.get('currentPolicyVersion');

  if (userVersion !== currentVersion) {
    return {
      needsAcceptance: true,
      currentVersion: currentVersion,
      userVersion: userVersion
    };
  }

  return { needsAcceptance: false };
}, {
  requireUser: true
});
```

---

### 7. Data Breach Response

**What:** Detect and respond to data breaches within 72 hours.

**Your Responsibility:**
- Monitor for breaches
- Document breach details
- Notify supervisory authority within 72 hours
- Notify affected users if high risk

**Implementation Example:**

**Monitor Audit Logs for Suspicious Activity:**
```javascript
Parse.Cloud.job('detectBreaches', async (request) => {
  const { message } = request;

  // Read recent audit logs and detect anomalies
  // Example: Multiple failed login attempts
  const fs = require('fs');
  const readline = require('readline');

  const logFile = './audit-logs/parse-server-audit-2025-10-01.log';
  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const failedLogins = {};

  for await (const line of rl) {
    try {
      const entry = JSON.parse(line);

      if (entry.eventType === 'USER_LOGIN' && entry.success === false) {
        const ip = entry.ipAddress;
        failedLogins[ip] = (failedLogins[ip] || 0) + 1;

        // Alert if > 10 failed attempts from same IP
        if (failedLogins[ip] > 10) {
          await notifySecurityTeam({
            type: 'POTENTIAL_BREACH',
            details: `Multiple failed login attempts from IP: ${ip}`,
            count: failedLogins[ip]
          });
        }
      }
    } catch (e) {
      // Skip invalid lines
    }
  }
});
```

**Document Breach:**
```javascript
const breachSchema = new Parse.Schema('DataBreach');
breachSchema.addString('type');
breachSchema.addString('description');
breachSchema.addDate('detectedAt');
breachSchema.addDate('occurredAt');
breachSchema.addNumber('affectedUsers');
breachSchema.addBoolean('authorityNotified');
breachSchema.addBoolean('usersNotified');
breachSchema.save();
```

---

## Part 3: What Your Organization Must Ensure 🏢

Beyond code, GDPR requires organizational and infrastructure measures.

### Infrastructure & Deployment

#### 1. Data Residency (if serving EU users)
- [ ] **Host database in EU region**
  - MongoDB Atlas: Frankfurt, Ireland, or London
  - AWS RDS/DocumentDB: eu-west-1, eu-central-1
  - Azure: West Europe, North Europe
  - Google Cloud: europe-west1, europe-west2

- [ ] **Host Parse Server in EU region**
  - Use EU-based servers or cloud regions

- [ ] **Store backups in EU region**
  - Ensure backup location complies with data residency

#### 2. Encryption
- [ ] **Encryption at Rest**
  - Enable database encryption (MongoDB: encryption at rest, PostgreSQL: TDE)
  - Encrypt file storage
  - Encrypt backups

- [ ] **Encryption in Transit**
  - HTTPS only (no HTTP)
  - TLS 1.2 or higher
  - Encrypted database connections (SSL/TLS)

#### 3. Access Control
- [ ] **Strong Master Key**
  - Generate cryptographically secure master key
  - Rotate regularly (e.g., annually)
  - Store securely (environment variables, secrets manager)

- [ ] **Role-Based Access Control**
  - Limit who can access Parse Server
  - Limit who can access database
  - Use Parse Server's ACL system

- [ ] **Multi-Factor Authentication**
  - Enable for all admin accounts
  - Enable for Parse Dashboard

#### 4. Backup & Recovery
- [ ] **Regular Backups**
  - Daily automated backups
  - Test restore procedures regularly

- [ ] **Backup Encryption**
  - Encrypt all backups

- [ ] **Backup Retention**
  - Define retention policy (e.g., 30 days)
  - Balance recovery needs vs. data minimization

#### 5. Audit Log Management
- [ ] **Secure Storage**
  - Store audit logs separately from application data
  - Use append-only storage (prevent tampering)

- [ ] **Long-term Retention**
  - Retain for 1-2 years minimum
  - Comply with local regulations

- [ ] **Regular Review**
  - Review logs for anomalies
  - Monitor for potential breaches

- [ ] **Backup Audit Logs**
  - Backup to immutable storage
  - Consider blockchain for tamper-evidence

### Legal & Compliance

#### 1. Legal Basis for Processing
Document the legal basis for each processing activity:
- **Consent** - User explicitly agreed
- **Contract** - Necessary to fulfill a contract
- **Legal Obligation** - Required by law
- **Vital Interests** - Protect life
- **Public Task** - Official function
- **Legitimate Interests** - Your business needs (balanced against user rights)

#### 2. Privacy Policy
Create and publish:
- [ ] What data you collect
- [ ] How you use it
- [ ] How long you retain it
- [ ] User rights (access, erasure, portability, etc.)
- [ ] Contact information
- [ ] DPO contact (if applicable)
- [ ] How to file a complaint

#### 3. Data Processing Agreements (DPAs)
Sign DPAs with all third-party processors:
- [ ] Database provider (MongoDB Atlas, AWS, etc.)
- [ ] Cloud provider (AWS, Azure, GCP)
- [ ] Email service (SendGrid, Mailgun, etc.)
- [ ] Analytics service (if used)
- [ ] Error tracking service (Sentry, etc.)
- [ ] Any other service that processes personal data

#### 4. Standard Contractual Clauses (SCCs)
For data transfers outside the EU:
- [ ] Ensure SCCs are in place with non-EU processors
- [ ] Alternative: Use processors with EU Adequacy Decision (UK, Canada, Japan, etc.)

#### 5. Data Protection Officer (DPO)
Appoint a DPO if:
- You have >250 employees, OR
- You process large-scale special category data, OR
- You systematically monitor individuals

#### 6. Data Protection Impact Assessment (DPIA)
Conduct DPIA for high-risk processing:
- Large-scale profiling
- Special category data
- Systematic monitoring
- Automated decision-making with legal effects

### Processes

#### 1. Data Subject Rights Request Process
- [ ] **Procedure to verify requesters** - Ensure they are who they claim
- [ ] **30-day response deadline** - Respond within one month
- [ ] **Free of charge** - Don't charge for first request
- [ ] **Request tracking** - Log all requests
- [ ] **Escalation process** - Handle complex requests

#### 2. Data Breach Response Plan
- [ ] **Detection procedures** - Monitor for breaches
- [ ] **72-hour notification to authority** - EU supervisory authority
- [ ] **User notification** - If high risk to users
- [ ] **Breach documentation** - Record all breaches
- [ ] **Post-mortem analysis** - Learn from incidents

#### 3. Vendor Management
- [ ] **Annual compliance reviews** - Verify vendor GDPR compliance
- [ ] **DPA renewals** - Keep agreements current
- [ ] **Vendor risk assessment** - Evaluate new vendors

### Training & Documentation

#### 1. Staff Training
- [ ] **Annual GDPR training** - All staff
- [ ] **Developer training** - Privacy by design
- [ ] **Security training** - Incident response
- [ ] **Training records** - Document all training

#### 2. Documentation
- [ ] **Records of Processing Activities** (Article 30)
  - What data you process
  - Why you process it
  - Who you share it with
  - How long you retain it

- [ ] **Data Inventory** - List all personal data

- [ ] **Data Flow Map** - Visualize data flows

- [ ] **Data Retention Schedule** - Retention period for each type

---

## GDPR Compliance Checklist Summary

### ✅ Parse Server Provides
- [x] Audit logging infrastructure
- [x] Configuration options
- [x] Documentation and examples

### 👨‍💻 You Must Implement (Code)
- [ ] Data export function (`exportMyData`)
- [ ] Data deletion function (`deleteMyData`)
- [ ] Consent management (schema + Cloud Code)
- [ ] Data retention job (`enforceDataRetention`)
- [ ] Privacy policy tracking
- [ ] Breach detection and response

### 🏢 Your Organization Must Ensure
- [ ] EU infrastructure (if applicable)
- [ ] Encryption (at rest and in transit)
- [ ] Access control and security
- [ ] Privacy policy and legal documents
- [ ] Data Processing Agreements
- [ ] Staff training
- [ ] Data protection processes

---

## Frequently Asked Questions

### Is Parse Server GDPR compliant?

**Parse Server provides audit logging infrastructure.** The rest of GDPR compliance depends on:
1. How you implement your application (Cloud Code functions)
2. How you deploy Parse Server (infrastructure, security)
3. How your organization operates (policies, training, processes)

Parse Server gives you the tools. You build the compliance.

### Do I need to host in the EU?

**Only if you process data of EU residents.** If your users are in the EU, GDPR applies and you should:
- Host in EU region, OR
- Use Standard Contractual Clauses (SCCs) for data transfer

### How long should I retain audit logs?

**Recommendation: 1-2 years minimum.** This gives you:
- Time to detect and respond to breaches
- Evidence for compliance audits
- Historical data for investigations

Check your local regulations for specific requirements.

### What if I can't delete data due to legal requirements?

**You can refuse deletion if you have a legal obligation to retain data** (Article 17.3). Examples:
- Financial records (tax law: 7-10 years)
- Medical records (varies by jurisdiction)
- Legal disputes (retain until resolved)

**Solution:** Anonymize instead of delete. Remove identifying information but keep the record.

### How do I handle data export for large datasets?

**Use pagination and background jobs:**

```javascript
Parse.Cloud.define('requestDataExport', async (request) => {
  // Create export job
  const exportJob = new Parse.Object('ExportJob');
  exportJob.set('user', request.user);
  exportJob.set('status', 'pending');
  await exportJob.save(null, { useMasterKey: true });

  // Process in background
  Parse.Cloud.startJob('processExport', { exportJobId: exportJob.id });

  return {
    jobId: exportJob.id,
    message: 'Export started. You will receive an email when ready.'
  };
}, {
  requireUser: true
});
```

### What about user data in external services (email, analytics, etc.)?

**You're responsible for the entire data ecosystem.** When a user requests deletion:
1. Delete from Parse Server (your code)
2. Delete from email service (their API)
3. Delete from analytics (their API)
4. Delete from any other service

Document all data flows and implement deletion across all systems.

---

## Resources

### Parse Server GDPR Documentation
- [GDPR_AUDIT_LOGGING.md](./GDPR_AUDIT_LOGGING.md) - Audit logging setup and configuration

### External Resources
- [Official GDPR Text](https://gdpr-info.eu/) - Complete regulation text
- [ICO GDPR Guide](https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/) - UK guidance
- [CNIL GDPR Resources](https://www.cnil.fr/en/home) - French supervisory authority
- [EDPB Guidelines](https://edpb.europa.eu/our-work-tools/general-guidance/gdpr-guidelines-recommendations-best-practices_en) - EU guidelines

### Tools
- [jq](https://stedolan.github.io/jq/) - Command-line JSON processor for querying audit logs
- [MongoDB Compass](https://www.mongodb.com/products/compass) - GUI for MongoDB
- [Parse Dashboard](https://github.com/parse-community/parse-dashboard) - Parse Server admin UI

---

## Support

For Parse Server-specific questions:
- [Parse Community Forum](https://community.parseplatform.org/)
- [GitHub Issues](https://github.com/parse-community/parse-server/issues)

For legal compliance questions:
- Consult a qualified attorney
- Contact your local Data Protection Authority

---

## License

This guide is provided as-is for informational purposes. It does not constitute legal advice. Consult with qualified legal counsel for compliance guidance specific to your situation.
