import React, { useState } from 'react';

const MdContext = React.createContext();
const QrContext = React.createContext();

const MdProvider = (props) => {
  const [md, setMd] = useState('Hello, **world**!');
  const mdContextValue = React.useMemo(() => [md, setMd], [md, setMd]);
  return (
    <MdContext.Provider value={mdContextValue}>
      {props.children}
    </MdContext.Provider>
  );

}

const useMd = (WrappedComponent) => {
  return function UseMd(props) {
    return (
      <MdContext.Consumer>
        {
          ({ md, setMd }) => (
            <WrappedComponent
              md={md}
              setMd={setMd}
            />
          )
        }
      </MdContext.Consumer>
    )
  }
}



const QrProvider = (props) => {

  const [qr, setQr] = useState('https://lahuman.github.io/assets/img/logo.png');
  const qrContextValue = React.useMemo(() => [qr, setQr], [qr, setQr]);
  return (
    <QrContext.Provider value={qrContextValue}>
      {props.children}
    </QrContext.Provider>
  );

}

const useQr = (WrappedComponent) => {
  return function UseMd(props) {
    return (
      <QrContext.Consumer>
        {
          ({ qr, setQr }) => (
            <WrappedComponent
              qr={qr}
              setQr={setQr}
            />
          )
        }
      </QrContext.Consumer>
    )
  }
}

export {
  MdContext,
  MdProvider,
  useMd,
  QrContext,
  QrProvider,
  useQr
} 
