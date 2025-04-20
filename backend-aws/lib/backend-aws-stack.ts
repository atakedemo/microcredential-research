import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elbv2tg from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Tg from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

interface BacendAwsStackProps extends cdk.StackProps {
  region: string
  instanceAmiId: string
  domainName: string
  hostedZoneId: string
  hostedZoneName: string
  acmArn: string
}

export class BackendAwsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: BacendAwsStackProps) {
    super(scope, id, props);

    // --------------------
    // VPC
    // --------------------
    // Create new VPC with 2 Subnets
    const vpc = new ec2.Vpc(this, 'VPC', {
      natGateways: 0,
      subnetConfiguration: [{
        cidrMask: 24,
        name: "asterisk",
        subnetType: ec2.SubnetType.PUBLIC
      }]
    });

    // --------------------
    // Security Group
    // --------------------
    const securityGroupEc2 = new ec2.SecurityGroup(this, 'SecurityGroupEc2', {
      vpc,
      description: 'EC2 SG for Android Emulator',
      allowAllOutbound: true
    });

    securityGroupEc2.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'allow HTTPS traffic from anywhere',
    );

    securityGroupEc2.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'allow HTTP traffic from anywhere',
    );

    securityGroupEc2.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(50051),
      'allow gRPC traffic from anywhere',
    );

    securityGroupEc2.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'allow gRPC traffic from anywhere',
    );

    const securityGroupAlb = new ec2.SecurityGroup(this, 'SecurityGroupAlb', {
      vpc,
      description: 'ALB SG for Android Emulator',
      allowAllOutbound: true
    });

    securityGroupAlb.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'allow HTTPS traffic from anywhere',
    );

    securityGroupAlb.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'allow HTTP traffic from anywhere',
    );

    securityGroupAlb.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(50051),
      'allow gRPC traffic from anywhere',
    );

    securityGroupAlb.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'allow gRPC traffic from anywhere',
    );

    securityGroupAlb.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      'allow all traffic',
    );

    // --------------------
    // IAM(Role, Policy)
    // --------------------
    // EC2インスタンス用のIAMロールを作成してSSMポリシーをアタッチ
    const ec2Role = new iam.Role(this, 'Ec2InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    // SSMのアクセスを許可するポリシーを追加
    ec2Role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // --------------------
    // EC2
    // --------------------
    const instanceType = new ec2.InstanceType('i3.metal');
    const instance = new ec2.Instance(this, 'Instance', {
      vpc,
        vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
        instanceType,
        machineImage: ec2.MachineImage.genericLinux({
          [props?.region as string]: props?.instanceAmiId as string,
        }),
        requireImdsv2: true,
        role: ec2Role,
        securityGroup: securityGroupEc2,
        blockDevices: [
          {
            deviceName: "/dev/sda1",
            volume: ec2.BlockDeviceVolume.ebs(40),
          },
        ],
    });

    // --------------------
    // ALB
    // --------------------
    // ACM
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', props?.acmArn as string);
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }),
      internetFacing: true,
      securityGroup: securityGroupAlb,
    });

    // Target Group
    const listener443 = alb.addListener("listener443", { 
      port: 443,
      certificates: [certificate]
    });
    listener443.addTargets('target443', {
      port: 80,
      targets: [new elbv2tg.InstanceIdTarget(instance.instanceId)],
      healthCheck: {
        port: '80',
        protocol: elbv2.Protocol.HTTP,
        path: '/',
        interval: cdk.Duration.seconds(10),
        healthyThresholdCount: 2
      }
    });

    const listener8080 = alb.addListener("listener8080", { 
      protocol: elbv2.ApplicationProtocol.HTTPS,
      port: 8080,
      certificates: [certificate]
    });
    listener8080.addTargets('target8080HttpPost', {
      port: 8080,
      targets: [new elbv2tg.InstanceIdTarget(instance.instanceId)],
      protocol: elbv2.ApplicationProtocol.HTTP,
      protocolVersion: elbv2.ApplicationProtocolVersion.GRPC,
      healthCheck: {
        interval: cdk.Duration.seconds(10),
        port: '8080',
        path: '/android.emulation.control.EmulatorController/getStatus',
        healthyGrpcCodes: '0-99'
      }
    });
    listener8080.addTargets('target8080HttpOptions', {
      port: 8080,
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.httpRequestMethods(['OPTIONS']),
      ],
      targets: [new elbv2tg.InstanceIdTarget(instance.instanceId)],
      protocol: elbv2.ApplicationProtocol.HTTP,
      protocolVersion: elbv2.ApplicationProtocolVersion.HTTP2,
      healthCheck: {
        interval: cdk.Duration.seconds(10),
        port: '80',
        path: '/',
      }
    });

    // Route53 A-Record
    new route53.ARecord(this, 'AlbAliasRecord', {
      recordName: props?.domainName as string,
      zone: route53.HostedZone.fromHostedZoneAttributes(this, 'DevHostedZone', {
        hostedZoneId :props?.hostedZoneId as string,
        zoneName: props?.hostedZoneName as string,
      }),
      target: route53.RecordTarget.fromAlias(
        new route53Tg.LoadBalancerTarget(alb)
      ),
    })
  }
}
