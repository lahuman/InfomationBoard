import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import MarkdownEditor from './components/MarkdownEditor'
import QrCodeGen from './components/QrCodeGen';
import { BoardContext } from './components/context';

const { Header, Content, Footer } = Layout;


const App = () => {

  const [markdown, setMarkdown] = useState({qrcode: `https://lahuman.github.io/assets/img/logo.png`, 
  md: 'Hello, **world**!'});
  const boardContextValue = React.useMemo(() => [markdown, setMarkdown], [markdown, setMarkdown]);

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
      <BoardContext.Provider value={boardContextValue} >
        <Content style={{ padding: '0 50px', marginTop: 64 }}>
          <div style={{ background: '#fff', padding: 24, minHeight: 380 }}>
            <QrCodeGen  />
            <MarkdownEditor  />
          </div>
        </Content>
      </BoardContext.Provider>

      <Footer style={{ textAlign: 'center' }}>
        InformationBoard ©2019 Created by lahuman
    </Footer>
    </Layout>
  );
}

export default App;
