/**
 * Utility functions for error handling
 */

/**
 * Extract error message from various error types
 * Handles Error objects, API error objects, and strings
 */
export function getErrorMessage(error: any): string {
  // If it's a string, return it
  if (typeof error === 'string') {
    return error;
  }

  // Try to access message property directly (works for Error objects)
  try {
    if (error?.message && typeof error.message === 'string') {
      // Check if the message is a JSON string and parse it
      if (error.message.startsWith('{') || error.message.startsWith('[')) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.message) {
            return parsed.message;
          }
          if (parsed.error) {
            return parsed.error;
          }
        } catch (jsonError) {
          // Not valid JSON, return as-is
        }
      }

      return error.message;
    }
  } catch (e) {
    // ignore
  }

  // Try toString() method (works for Error objects that don't expose enumerable properties)
  try {
    if (error && typeof error.toString === 'function') {
      const errorStr = error.toString();
      if (errorStr !== '[object Object]' && errorStr !== 'Error') {
        return errorStr.replace('Error: ', '');
      }
    }
  } catch (e) {
    // ignore
  }

  // If it's an object, try to extract meaningful info
  if (typeof error === 'object' && error !== null) {
    // Check for common API error structures
    if (error.error && typeof error.error === 'string') {
      return error.error;
    }
    if (error.data?.message && typeof error.data.message === 'string') {
      return error.data.message;
    }
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.response?.data?.error) {
      return error.response.data.error;
    }

    // Try to create a readable message from the object
    try {
      const errorString = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);

      if (errorString && errorString !== '{}' && errorString !== 'null') {
        const parsed = JSON.parse(errorString);
        if (parsed.message) {
          return parsed.message;
        }
      }

      // If the JSON is very long or complex, just show a generic message
      if (errorString.length > 200) {
        return 'An error occurred. Please check your connection and try again.';
      }
      if (errorString !== '{}') {
        return errorString;
      }
    } catch (stringifyError) {
      // ignore
    }
  }

  // Fallback
  return 'An unknown error occurred. Please try again.';
}
