
import React from 'react'
import Remarkable from 'remarkable';
import { Row, Col, Input } from 'antd';


class MarkdownEditor extends React.Component {
  constructor(props) {
    super(props);
    this.handleChange = this.handleChange.bind(this);
    this.state = { value: 'Hello, **world**!' , qrcode: this.props.qrcode };
  }

  handleChange(e) {
    this.setState({ value: e.target.value });
  }

  getRawMarkup() {
    const md = new Remarkable('full', {
      html: true,
      linkify: true,
      typographer: true,
    });

    return { __html: md.render(this.state.value) };
  }

  render() {
    let { qrcode } = this.props;
    function createMarkup() { return {__html: qrcode}; };
    return (
      <Row justify="center" gutter={24}>
        <Col span={12}><Input.TextArea rows="20"
          id="markdown-content"
          onChange={this.handleChange}
          defaultValue={this.state.value}
        /></Col>
        <Col span={12} className="content">

          <Row >
           <Col span={24} dangerouslySetInnerHTML={this.getRawMarkup()} ></Col>
           <Col style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center'}} span={24} dangerouslySetInnerHTML={createMarkup()} ></Col>

          </Row>
        </Col>
       
      </Row>
    );
  }
}


export default MarkdownEditor;