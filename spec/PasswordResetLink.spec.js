'use strict';

describe('Password Reset Link', () => {
  it('should generate a password reset link with actual appId, not {appId}', async () => {
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        // Check that the link contains the actual appId ('test'), not the literal string '{appId}'
        expect(options.link).toBeDefined();
        expect(options.link).not.toContain('{appId}');
        expect(options.link).toContain('/test/');
        console.log('Password reset link:', options.link);
        return Promise.resolve();
      },
      sendMail: () => Promise.resolve(),
    };

    await reconfigureServer({
      appId: 'test',
      appName: 'Test App',
      verifyUserEmails: true,
      emailAdapter: emailAdapter,
      publicServerURL: 'http://localhost:8378/1',
    });

    const user = new Parse.User();
    user.setPassword('password');
    user.setUsername('testuser');
    user.set('email', 'test@example.com');
    await user.signUp();
    
    await Parse.User.requestPasswordReset('test@example.com');
  });
});
