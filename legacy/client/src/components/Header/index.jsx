import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { MdContext, QrContext, UrlContext, FullContext } from '../context';
import QRCode from 'qrcode';

import FileModal from './FileModal';

const { Header } = Layout;

const HeaderMenu = (props) => {
  const [md, setMd] = React.useContext(MdContext);
  const [qr, setQr] = React.useContext(QrContext);
  const [, setUrl] = React.useContext(UrlContext);
  const [, setIsFull] = React.useContext(FullContext);
  
  const [visible, setVisible] = useState(false);
  const [uploadVal, setUploadVal] = useState({});
  const [okDisabled, setOkDisabled] = useState(true);

  const downloadFile = () => {
    const element = document.createElement("a");
    const file = new Blob([JSON.stringify({ md: md, qr: qr })], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = "information.json";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  }
  const uploadFile = () => {
    setOkDisabled(true);
    setVisible(true);
  }
  const onOk = () => {
    setVisible(false);
    setMd(uploadVal.md);
    setQr(uploadVal.qr);
    QRCode.toDataURL(uploadVal.qr, function (err, url) {
      setUrl(url);
    });
  }
  const onCancel = () => {
    setVisible(false);
  }
  const fileuploaded = 	(error, file) => {
    setUploadVal(JSON.parse(file.serverId));
    setOkDisabled(false);
  }
  
  const showFull = () =>{
    setIsFull(true);
  }
  return (
    <Header style={{ position: 'fixed', zIndex: 1, width: '100%' }}>
      <div className="logo" />
      <Menu
        theme="dark"
        mode="horizontal"
        defaultSelectedKeys={['0']}
        style={{ lineHeight: '64px' }}
      >
        <Menu.Item key="1" onClick={downloadFile}>저장</Menu.Item>
        <Menu.Item key="2" onClick={uploadFile}>불러오기</Menu.Item>
        <Menu.Item key="3" onClick={showFull}>안내판 쇼</Menu.Item>
      </Menu>
      <FileModal vals={{visible, okDisabled}} handles={{onCancel, onOk, fileuploaded}} />
      {/* <Modal
          title="File Upload"
          visible={visible}
          onCancel={onCancel}
          onOk={onOk}
          okButtonProps={{disabled: okDisabled}} >
          <FilePond ref={fileForm} name={"file"} server="http://localhost:3001/upload" onprocessfile={fileuploaded} />
        </Modal> */}
    </Header>
  );
}

export default HeaderMenu;