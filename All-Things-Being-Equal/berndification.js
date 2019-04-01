module.exports = function (token) {
  if (token.type == 'Identifier') {
    token.value = 'BERND';
  }
  if (token.type == 'String') {
    token.value = 'BERND';
  }
  if (token.type == 'Numeric') {
    token.value = '42';
  }
  if (token.type == 'Punctuator' && token.value == ';') {
    token = null;
  }
  return token;
};
