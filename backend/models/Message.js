const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    conversationKey: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    senderUsername: {
      type: String,
      required: true,
      trim: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    recipientUsername: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      default: null,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

messageSchema.index({ roomCode: 1, conversationKey: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
