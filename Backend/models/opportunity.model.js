// models/opportunity.model.js
const mongoose = require('mongoose');

const opportunitySchema = new mongoose.Schema(
    {
        ngo_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Matches your existing users.model.js exports name
            required: [true, 'Opportunity must belong to an NGO']
        },
        title: {
            type: String,
            required: [true, 'Title is required'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters']
        },
        description: {
            type: String,
            required: [true, 'Description is required'],
            trim: true
        },
        required_skills: {
            type: [String],
            required: [true, 'At least one required skill must be specified'],
            validate: {
                validator: function (v) {
                    return Array.isArray(v) && v.length > 0;
                },
                message: 'Required skills array cannot be empty'
            }
        },
        duration: {
            type: String,
            required: [true, 'Duration is required'], // e.g., "3 hours per session"
            trim: true
        },
        location: {
            type: String,
            required: [true, 'Location is required'],
            trim: true
        },
        status: {
            type: String,
            enum: {
                values: ['open', 'in-progress', 'closed'],
                message: '{VALUE} is not a valid status'
            },
            default: 'open'
        }
    },
    {
        timestamps: true // Auto-generates createdAt and updatedAt
    }
);

// Indexing for search performance (Day 6 requirement)
opportunitySchema.index({ title: 'text', description: 'text' });

const Opportunity = mongoose.model('Opportunity', opportunitySchema);

module.exports = Opportunity;