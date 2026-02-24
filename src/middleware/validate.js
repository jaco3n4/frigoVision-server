const MAX_TEXT_LENGTH = 10000;
const MAX_ARRAY_SIZE = 50;
const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB

function validateText(text, fieldName) {
  if (text && typeof text === "string" && text.length > MAX_TEXT_LENGTH) {
    const err = new Error(`${fieldName} trop long (max ${MAX_TEXT_LENGTH} caractères).`);
    err.statusCode = 400;
    throw err;
  }
}

function validateArray(arr, fieldName) {
  if (arr && Array.isArray(arr) && arr.length > MAX_ARRAY_SIZE) {
    const err = new Error(`${fieldName} trop grand (max ${MAX_ARRAY_SIZE} éléments).`);
    err.statusCode = 400;
    throw err;
  }
}

function validateBase64(data, fieldName) {
  if (data && typeof data === "string" && data.length > MAX_BASE64_SIZE) {
    const err = new Error(`${fieldName} trop volumineux (max 10MB).`);
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  validateText,
  validateArray,
  validateBase64,
  MAX_TEXT_LENGTH,
  MAX_ARRAY_SIZE,
  MAX_BASE64_SIZE,
};
