const Admission = require('../models/Admission');
const Bed = require('../models/Bed');
const Billing = require('../models/Billing');
const Notification = require('../models/Notification');
const { getPool } = require('../config/database');

class AdmissionService {
  async admitPatient(admissionData) {
    const conn = await getPool().getConnection();
    await conn.beginTransaction();

    try {
      const [bedRows] = await conn.execute(
        'SELECT * FROM `Beds` WHERE `id` = ? FOR UPDATE',
        [admissionData.bedId]
      );
      const bed = bedRows[0];
      if (!bed || bed.status !== 'Available') {
        throw new Error('Bed not available');
      }

      const [admResult] = await conn.execute(
        `INSERT INTO \`Admissions\`
           (\`patientId\`,\`bedId\`,\`roomId\`,\`admissionDate\`,\`estimatedDischargeDate\`,\`status\`,\`admissionType\`,\`notes\`,\`createdBy\`)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [admissionData.patientId, admissionData.bedId, admissionData.roomId,
         admissionData.admissionDate || new Date(),
         admissionData.estimatedDischargeDate || null,
         admissionData.status || 'Admitted',
         admissionData.admissionType || 'Planned',
         admissionData.notes || null,
         admissionData.createdBy]
      );
      const admissionId = admResult.insertId;

      await conn.execute(
        "UPDATE `Beds` SET `status` = 'Occupied', `patientId` = ? WHERE `id` = ?",
        [admissionData.patientId, admissionData.bedId]
      );

      await conn.execute(
        'INSERT INTO `Billing` (`admissionId`,`patientId`,`totalAmount`) VALUES (?,?,0)',
        [admissionId, admissionData.patientId]
      );

      await conn.execute(
        `INSERT INTO \`Notifications\` (\`recipientId\`,\`type\`,\`message\`,\`relatedEntity\`,\`relatedId\`)
         VALUES (?,?,?,?,?)`,
        [admissionData.createdBy, 'Admission',
         `Patient admitted to bed ${bed.bedNumber}`, 'Admission', admissionId]
      );

      await conn.commit();
      return Admission.findById(admissionId);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async dischargePatient(admissionId, dischargeDate) {
    const conn = await getPool().getConnection();
    await conn.beginTransaction();

    try {
      const [admRows] = await conn.execute(
        'SELECT * FROM `Admissions` WHERE `id` = ?',
        [admissionId]
      );
      const admission = admRows[0];
      if (!admission) throw new Error('Admission not found');

      const actualDischarge = dischargeDate || new Date();
      await conn.execute(
        "UPDATE `Admissions` SET `status` = 'Discharged', `actualDischargeDate` = ? WHERE `id` = ?",
        [actualDischarge, admissionId]
      );

      await conn.execute(
        "UPDATE `Beds` SET `status` = 'Cleaning', `patientId` = NULL WHERE `id` = ?",
        [admission.bedId]
      );

      await conn.execute(
        "UPDATE `Billing` SET `status` = 'Pending' WHERE `admissionId` = ?",
        [admissionId]
      );

      await conn.commit();
      return Admission.findById(admissionId);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async getAdmissions(filters = {}) {
    return Admission.findAll(filters);
  }

  async getAdmissionById(id) {
    return Admission.findById(id);
  }
}

module.exports = new AdmissionService();
