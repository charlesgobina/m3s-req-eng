export const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500).json({
        error: {
            message: err.message || 'Internal server error',
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
    });
};
