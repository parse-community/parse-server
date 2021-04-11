export var __esModule: boolean;
export default _default;
/**
 * @module Adapters
 */
/**
 * @interface MailAdapter
 * Mail Adapter prototype
 * A MailAdapter should implement at least sendMail()
 */
export class MailAdapter {
    /**
     * A method for sending mail
     * @param options would have the parameters
     * - to: the recipient
     * - text: the raw text of the message
     * - subject: the subject of the email
     */
    sendMail(options: any): void;
}
declare var _default: typeof MailAdapter;
