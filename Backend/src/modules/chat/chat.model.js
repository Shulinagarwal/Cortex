const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
    title : {
        type : String,
        default : "New Chat"
    },
    createdby : {
        type: mongoose.Schema.Types.ObjectId,
        ref : "User"
    },
    summary : {
        text : { type : String, default : null },
        summarizedThroughMessageId : { type : mongoose.Schema.Types.ObjectId, default : null },
        updatedAt : { type : Date, default : null }
    }
},{timestamps : true})

const ChatModel = mongoose.models.Chat || mongoose.model("Chat" , chatSchema);

module.exports = ChatModel;