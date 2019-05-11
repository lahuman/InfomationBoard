import React from 'react';
import { Layout, Menu } from 'antd';
import {MdContext, QrContext} from '../context';

const { Header } = Layout;

const HeaderMenu = (props) => {
  const  [md, ] = React.useContext(MdContext);
  const [qr, ] = React.useContext(QrContext);
  const downloadFile = () => {
    
    const element = document.createElement("a");
    const file = new Blob([JSON.stringify({md:md, qr:qr})], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = "information.json";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
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
          <Menu.Item key="2">불러오기</Menu.Item>
          <Menu.Item key="3">안내판 쇼</Menu.Item>
        </Menu>
      </Header>
  );
}

export default HeaderMenu;