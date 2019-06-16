import React from 'react';
import { Layout } from 'antd';
import { MdProvider, QrProvider, UrlProvider, FullProvider } from './components/context';
import MarkdownEditor from './components/MarkdownEditor';
import QrCodeGen from './components/QrCodeGen';
import Header from './components/Header';

const { Content, Footer } = Layout;


const App = () => {
  

  const AppProvider = ({ contexts, children }) => contexts.reduce(
    (prev, context) => React.createElement(context, {
      children: prev
    }),
    children
  );


  return (
    <Layout>
       <AppProvider
        contexts={[MdProvider, QrProvider, UrlProvider, FullProvider]}
      >
        <Header />
     
        <Content style={{ padding: '0 50px', marginTop: 64 }}>
          <div style={{ background: '#fff', padding: 24, minHeight: 380 }}>
            <QrCodeGen />
            <MarkdownEditor />
          </div>
        </Content>
      </AppProvider>


      <Footer style={{ textAlign: 'center' }}>
        InformationBoard ©2019 Created by lahuman
    </Footer>
    </Layout>
  );
}

export default App;
