const marklog = message => {
  const e = new Error();
  const frame = e.stack.split('\n')[2]; // go up the stack to the caller
  const lineNumber = frame.split(':').reverse()[1];
  const functionName = frame.split(' ')[5];
  console.log('MARK: ' + functionName + ':' + lineNumber + ': ' + message);
};

export default marklog;
