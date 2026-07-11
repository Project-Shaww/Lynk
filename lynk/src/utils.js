function generateUniqueId() {
    return Math.random().toString(36).substring(2, 19);
}

module.exports = { generateUniqueId }