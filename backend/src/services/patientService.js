const Patient = require('../models/Patient');
const axios = require('axios');
const { hisQuery } = require('../config/database');

const HIS_OCCUPIED_BEDS_SQL = `
  SELECT
    A.IPD_DATE    AS "ADMISSION_DATE",
    A.PT_NO       AS "PT_NO",
    A.PTC_PTNAME  AS "PT_NAME",
    B.DOC_NAME    AS "DOCTOR",
    C.DPC_DESC    AS "DEPARTMENT",
    F.BDC_NO      AS "BED",
    G.NSC_DESC    AS "NUR_STATION",
    E.REQ_DATE    AS "DISC_REQ_DATE",
    A.IPD_DISC    AS "DIS_ENTRY_TIME",
    A.DMD_DATE    AS "DIS_BILLED_TIME"
  FROM IPADMISS A, DOCTOR B, DEPARTMENT C,
       SPECIALITY D, DISREQUESTDETL E, BED F, NURSTATION G
  WHERE A.IP_NO  = E.IP_NO
    AND A.DO_CODE = B.DO_CODE
    AND B.SP_CODE = D.SP_CODE
    AND C.DP_CODE = D.DP_CODE
    AND A.BD_CODE = F.BD_CODE
    AND F.NS_CODE = G.NS_CODE
  ORDER BY A.DMD_DATE DESC
`;

class PatientService {
  async createPatient(patientData) {
    return Patient.create(patientData);
  }

  async getPatients(filters = {}) {
    return Patient.findAll(filters);
  }

  async getPatientById(id) {
    return Patient.findById(id);
  }

  async updatePatient(id, updateData) {
    return Patient.update(id, updateData);
  }

  async searchPatientFromHIS(searchTerm) {
    try {
      const response = await axios.get(`${process.env.HIS_API_URL}/patients/search`, {
        params: { q: searchTerm },
        headers: { Authorization: `Bearer ${process.env.HIS_API_TOKEN}` },
      });

      return response.data.patients.map((patient) => ({
        uhid: patient.uhid,
        patientId: patient.id,
        name: patient.name,
        gender: patient.gender,
        dob: patient.dob,
        doctor: patient.doctor,
        department: patient.department,
        insurance: patient.insurance,
      }));
    } catch (error) {
      console.error('HIS API error:', error.message);
      throw new Error('Failed to fetch patient from HIS');
    }
  }

  async getOccupiedBedsFromHIS() {
    return hisQuery(HIS_OCCUPIED_BEDS_SQL);
  }

  async syncPatientFromHIS(uhid) {
    try {
      const response = await axios.get(`${process.env.HIS_API_URL}/patients/${uhid}`, {
        headers: { Authorization: `Bearer ${process.env.HIS_API_TOKEN}` },
      });

      const p = response.data;
      return Patient.upsert({
        uhid: p.uhid,
        patientId: p.id,
        name: p.name,
        gender: p.gender,
        dob: p.dob,
        doctor: p.doctor,
        department: p.department,
        insurance: p.insurance,
        contact: p.contact,
        emergencyContact: p.emergencyContact,
      });
    } catch (error) {
      console.error('HIS sync error:', error.message);
      throw new Error('Failed to sync patient from HIS');
    }
  }
}

module.exports = new PatientService();
