const Billing = require('../models/Billing');
const Room = require('../models/Room');
const Admission = require('../models/Admission');
const axios = require('axios');

class BillingService {
  async calculateRoomCharges(admissionId) {
    const billing = await Billing.findByAdmission(admissionId);
    if (!billing) throw new Error('Billing record not found');

    const admission = await Admission.findById(admissionId);
    const room = await Room.findById(admission.roomId);

    const days = Math.ceil((new Date() - new Date(admission.admissionDate)) / (1000 * 60 * 60 * 24));
    const totalRoomCharge = days * room.price;

    billing.roomCharges.push({
      date: new Date(),
      amount: totalRoomCharge,
      description: `Room charges for ${days} days`,
    });
    billing.totalAmount += totalRoomCharge;

    return Billing.save(billing);
  }

  async addICUCharges(admissionId, days, surcharge) {
    const billing = await Billing.findByAdmission(admissionId);
    if (!billing) throw new Error('Billing record not found');

    const charge = days * surcharge;
    billing.icuCharges.push({
      date: new Date(),
      amount: charge,
      description: `ICU surcharge for ${days} days`,
    });
    billing.totalAmount += charge;

    return Billing.save(billing);
  }

  async syncToHIS(billingId) {
    const billing = await Billing.findByIdWithPatient(billingId);
    if (!billing) throw new Error('Billing not found');

    try {
      await axios.post(
        `${process.env.HIS_API_URL}/billing/sync`,
        {
          patientId: billing.hisPatientId,
          amount: billing.totalAmount,
          description: 'Room booking charges',
        },
        { headers: { Authorization: `Bearer ${process.env.HIS_API_TOKEN}` } }
      );

      billing.syncedToHIS = true;
      return Billing.save(billing);
    } catch (error) {
      console.error('HIS billing sync error:', error.message);
      throw new Error('Failed to sync billing to HIS');
    }
  }

  async getBillingByAdmission(admissionId) {
    return Billing.findByAdmission(admissionId);
  }

  async updatePayment(billingId, paidAmount) {
    const billing = await Billing.findById(billingId);
    if (!billing) throw new Error('Billing not found');

    billing.paidAmount += paidAmount;
    if (billing.paidAmount >= billing.totalAmount) {
      billing.status = 'Paid';
    } else if (billing.paidAmount > 0) {
      billing.status = 'Partially Paid';
    }

    return Billing.save(billing);
  }
}

module.exports = new BillingService();
