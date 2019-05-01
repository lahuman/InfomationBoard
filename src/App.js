import React, { useState, useCallback } from 'react';
import { Layout, Menu } from 'antd';
import MarkdownEditor from './components/MarkdownEditor'
import QrCodeGen from './components/QrCodeGen';

const { Header, Content, Footer } = Layout;


const App = () =>  {

  const [qrcode, setQrcode] = useState(`<img src='https://lahuman.github.io/assets/img/logo.png' width='100px' />`);
  
  const callbackFunction = useCallback(() => {
    console.log(qrcode, "callback called");
    // Do something with callbackCount ...
    return qrcode;
  }, [qrcode]);

    return (
      <Layout>
        <Header style={{ position: 'fixed', zIndex: 1, width: '100%' }}>
          <div className="logo" />
          <Menu
            theme="dark"
            mode="horizontal"
            defaultSelectedKeys={['0']}
            style={{ lineHeight: '64px' }}
          >
            <Menu.Item key="1">저장</Menu.Item>
            <Menu.Item key="2">불러오기</Menu.Item>
            <Menu.Item key="3">안내판 쇼</Menu.Item>
          </Menu>
        </Header>

        <Content style={{ padding: '0 50px', marginTop: 64 }}>
          <div style={{ background: '#fff', padding: 24, minHeight: 380 }}>
            <QrCodeGen action={setQrcode} />
            <MarkdownEditor qrcode={qrcode} />
          </div>
        </Content>

        <Footer style={{ textAlign: 'center' }}>
          InformationBoard ©2019 Created by lahuman
    </Footer>
      </Layout>
    );
  }

export default App;
