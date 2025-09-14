// server/models/RegistrationCode.js
const mongoose = require('mongoose');

const registrationCodeSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, required: true, index: true },
    normalizedCode: { type: String, unique: true, sparse: true, index: true },
    used: { type: Boolean, default: false, index: true },
    usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    usedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RegistrationCode', registrationCodeSchema);
