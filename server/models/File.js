// server/models/File.js
const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    originalName: { type: String, required: true },
    uploadKey: { type: String, required: true },
    processedKey: { type: String },
    transcriptKey: { type: String },
    hasPII: { type: Boolean, default: false },
    hasPCI: { type: Boolean, default: false },
    encrypted: { type: Boolean, default: false },
    encryptionKeyB64: { type: String },
    encryptionIvB64: { type: String },
    status: { type: String, enum: ['uploaded', 'processing', 'completed', 'failed'], default: 'uploaded' },
    error: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('File', fileSchema);

