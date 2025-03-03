import mongoose from 'mongoose';

// MongoDB connection
export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Session schema
const sessionSchema = new mongoose.Schema({
  _id: String, // session ID
  data: {
    creds: Object,
    keys: Object
  }
}, { versionKey: false });

const Session = mongoose.model('Session', sessionSchema);

// Session management
export const session = {
  save: async (id, data) => {
    try {
      await Session.findOneAndUpdate(
        { _id: id },
        { data },
        { upsert: true }
      );
    } catch (error) {
      console.error('❌ Session save failed:', error.message);
    }
  },

  load: async (id) => {
    try {
      const result = await Session.findById(id);
      return result?.data || null;
    } catch (error) {
      console.error('❌ Session load failed:', error.message);
      return null;
    }
  },

  clear: async (id) => {
    try {
      await Session.deleteOne({ _id: id });
    } catch (error) {
      console.error('❌ Session clear failed:', error.message);
    }
  }
};