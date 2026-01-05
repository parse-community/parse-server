'use strict';

describe('Password Reset Link', () => {
  it('should generate a password reset link with actual appId, not {appId} or undefined', async () => {
    let emailLinkReceived = null;
    
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: options => {
        emailLinkReceived = options.link;
        // Check that the link contains the actual appId ('test'), not the literal string '{appId}'
        expect(options.link).toBeDefined();
        expect(options.link).not.toContain('{appId}');
        expect(options.link).toContain('/test/');
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
    
    // Verify the link was generated correctly
    expect(emailLinkReceived).not.toBeNull();
    expect(emailLinkReceived).toMatch(/\/test\/request_password_reset\?token=/);
  });
  
  it('should render password reset page with actual appId in form action', async () => {
    const emailAdapter = {
      sendVerificationEmail: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
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
    user.setUsername('testuser2');
    user.set('email', 'test2@example.com');
    await user.signUp();
    
    // Trigger password reset to get a token
    await Parse.User.requestPasswordReset('test2@example.com');
    
    // Find the user to get the reset token
    const results = await Parse.Query('_User')
      .equalTo('email', 'test2@example.com')
      .find({ useMasterKey: true });
    const resetToken = results[0].get('_perishable_token');
    
    // Request the password reset page
    const response = await request({
      url: `http://localhost:8378/1/apps/test/request_password_reset?token=${resetToken}`,
      followRedirects: false,
    });
    
    expect(response.status).toBe(200);
    // The form action should contain the actual appId 'test', not '{appId}'
    expect(response.text).toContain('/apps/test/request_password_reset');
    expect(response.text).not.toContain('{appId}');
  });
});
