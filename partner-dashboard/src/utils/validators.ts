export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phoneRegex = /^(\+359|0)\d{9}$/;

export const validateEmail = (email: string): boolean => {
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  return phoneRegex.test(phone);
};

export const validatePassword = (password: string): string | null => {
  if (password.length < 8) {
    return 'Паролата трябва да е поне 8 символа';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Паролата трябва да съдържа поне една главна буква';
  }
  if (!/[a-z]/.test(password)) {
    return 'Паролата трябва да съдържа поне една малка буква';
  }
  if (!/[0-9]/.test(password)) {
    return 'Паролата трябва да съдържа поне една цифра';
  }
  return null;
};

export const validateBulgarianEGN = (egn: string): boolean => {
  if (!/^\\d{10}$/.test(egn)) return false;
  
  const weights = [2, 4, 8, 5, 10, 9, 7, 3, 6];
  let sum = 0;
  
  for (let i = 0; i < 9; i++) {
    sum += parseInt(egn[i]) * weights[i];
  }
  
  const checksum = sum % 11;
  const lastDigit = checksum < 10 ? checksum : 0;
  
  return parseInt(egn[9]) === lastDigit;
};

export const validateForm = (values: Record<string, any>, rules: Record<string, any>): Record<string, string> => {
  const errors: Record<string, string> = {};
  
  Object.keys(rules).forEach(field => {
    const value = values[field];
    const fieldRules = rules[field];
    
    if (fieldRules.required && !value) {
      errors[field] = `${field} е задължително поле`;
    }
    
    if (fieldRules.email && value && !validateEmail(value)) {
      errors[field] = 'Невалиден email адрес';
    }
    
    if (fieldRules.minLength && value && value.length < fieldRules.minLength) {
      errors[field] = `Минимална дължина ${fieldRules.minLength} символа`;
    }
  });
  
  return errors;
};